"""Verify the release asset contract and, optionally, the GitHub upload."""

import argparse
import base64
import hashlib
import json
import re
import subprocess
import tempfile
import tomllib
from pathlib import Path


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def check_version(tag):
    version = tag.removeprefix("v")
    require(
        tag.startswith("v")
        and re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+\.)*[0-9A-Za-z-]+)?", version)
        and all(not (part.isdigit() and part.startswith("0") and len(part) > 1)
                for part in version.partition("-")[2].split(".")),
        f"Invalid release tag: {tag}",
    )
    return version


def verify_source(tag):
    version = check_version(tag)
    for path in ("package.json", "apps/web/package.json", "apps/desktop/package.json",
                 "packages/shared/package.json", "apps/desktop/src-tauri/tauri.conf.json"):
        require(read_json(Path(path))["version"] == version, f"Version mismatch in {path}")
    cargo = Path("apps/desktop/src-tauri")
    require(tomllib.loads((cargo / "Cargo.toml").read_text(encoding="utf-8"))["package"]["version"] == version,
            "Version mismatch in Cargo.toml")
    locked = tomllib.loads((cargo / "Cargo.lock").read_text(encoding="utf-8"))["package"]
    require(any(p["name"] == "audio-studio-desktop" and p["version"] == version for p in locked),
            "Version mismatch in Cargo.lock")


def verify_assets(root, tag, repo, verify_signatures):
    version = check_version(tag)
    base_url = f"https://github.com/{repo}/releases/download/{tag}/"
    files = {path.name: path for path in root.rglob("*") if path.is_file()}
    require(len(files) == sum(path.is_file() for path in root.rglob("*")), "Duplicate asset filenames")
    names = set(files)
    digest = {}
    for name, path in files.items():
        with path.open("rb") as file:
            digest[name] = hashlib.file_digest(file, "sha256").hexdigest()
    checksums = {}
    for line in files["SHA256SUMS.txt"].read_text(encoding="utf-8").splitlines():
        value, filename = line.split("  ", 1)
        name = Path(filename).name  # v0.2.2 and earlier used build-directory paths.
        require(name not in checksums, f"Duplicate entry in SHA256SUMS: {name}")
        checksums[name] = value
    require(checksums == {name: digest[name] for name in names - {"SHA256SUMS.txt"}}, "SHA256SUMS mismatch")

    manifest = read_json(files["release-manifest.json"])
    require(manifest["schemaVersion"] == 1 and manifest["tag"] == tag and manifest["version"] == version,
            "Release manifest version mismatch")
    require(manifest["channel"] == ("beta" if "-" in version else "stable"), "Release channel mismatch")
    assets = manifest["assets"]
    expected = names - {"SHA256SUMS.txt", "release-manifest.json", "latest.json"}
    require(len(assets) == len(expected) and {asset["name"] for asset in assets} == expected,
            "Unexpected entries in release manifest")
    for asset in assets:
        name = asset["name"]
        require(asset["url"] == base_url + name and asset["sha256"] == digest[name]
                and asset["sizeBytes"] == files[name].stat().st_size, f"Invalid manifest entry: {name}")

    exe = [name for name in names if name.endswith("-setup.exe") and "_x64" in name]
    msi = [name for name in names if name.endswith(".msi") and "_x64" in name]
    require(len(exe) == len(msi) == 1, "Expected one x64 EXE and MSI")
    require(f"AudioStudio-{tag}-web.zip" in names, "Missing Web ZIP")
    for installer in exe + msi:
        signature = files[installer + ".sig"]
        require(f"_{version}_x64" in installer and signature.stat().st_size > 0,
                f"Invalid updater pair: {installer}")
        if verify_signatures:
            verify_signature(files[installer], signature, version)
    latest = read_json(files["latest.json"])
    platform = latest["platforms"]["windows-x86_64"]
    require(latest["version"] == version and platform["url"] == base_url + exe[0]
            and platform["signature"] == files[exe[0] + ".sig"].read_text(encoding="utf-8").strip(),
            "Tauri updater metadata mismatch")
    return digest


def verify_signature(installer, signature, version):
    config = read_json(Path("apps/desktop/src-tauri/tauri.conf.json"))
    key = base64.b64decode(config["plugins"]["updater"]["pubkey"], validate=True)
    data = base64.b64decode(signature.read_bytes().strip(), validate=True)
    fields = data.decode("utf-8").splitlines()[2].split("\t")
    require(f"version:{version}" in fields, f"Signature version mismatch for {installer.name}")
    with tempfile.TemporaryDirectory(prefix="audio-studio-signature-") as temp:
        public_key = Path(temp, "tauri.pub")
        decoded = Path(temp, "installer.minisig")
        public_key.write_bytes(key)
        decoded.write_bytes(data)
        subprocess.run(["minisign", "-Vm", str(installer), "-p", str(public_key), "-x", str(decoded)], check=True)


def verify_upload(repo, tag, digests, published):
    command = ["gh", "api"]
    if published:
        release = json.loads(subprocess.check_output(command + [f"repos/{repo}/releases/tags/{tag}"], encoding="utf-8"))
    else:
        pages = json.loads(subprocess.check_output(
            command + ["--paginate", "--slurp", f"repos/{repo}/releases?per_page=100"], encoding="utf-8"
        ))
        matches = [release for page in pages for release in page if release["tag_name"] == tag]
        require(len(matches) == 1, "Expected exactly one uploaded draft for the tag")
        release = matches[0]
    require(release["draft"] != published, "Unexpected draft/published state")
    actual = {asset["name"]: asset["digest"] for asset in release["assets"] if asset["state"] == "uploaded"}
    require(actual == {name: f"sha256:{digest}" for name, digest in digests.items()},
            "GitHub uploaded assets differ from verified local assets")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tag")
    parser.add_argument("directory", type=Path, nargs="?")
    parser.add_argument("repository", nargs="?")
    parser.add_argument("--verify-signatures", action="store_true")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--draft", action="store_true")
    mode.add_argument("--published", action="store_true")
    args = parser.parse_args()
    if args.directory is None:
        verify_source(args.tag)
    else:
        digests = verify_assets(args.directory, args.tag, args.repository, args.verify_signatures)
        if args.draft or args.published:
            verify_upload(args.repository, args.tag, digests, args.published)
    print(f"Verified {args.tag}")
