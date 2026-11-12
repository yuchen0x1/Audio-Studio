const AUDIO_EXT = /\.(mp3|wav|flac|aac|m4a|ogg|oga|opus|wma|aiff|aif|ape|ac3|amr)$/i;

/** Read supported audio files from a dropped directory, with bounded depth and count. */
export async function readAllFiles(entry: FileSystemEntry, out: File[], depth = 0): Promise<void> {
  if (depth > 3 || out.length >= 500) return;
  if (entry.isFile) {
    const file = await new Promise<File | null>((resolve) => {
      (entry as FileSystemFileEntry).file(
        (value) => resolve(value),
        () => resolve(null),
      );
    });
    if (file && AUDIO_EXT.test(file.name)) out.push(file);
    return;
  }
  if (!entry.isDirectory) return;

  const reader = (entry as FileSystemDirectoryEntry).createReader();
  while (out.length < 500) {
    const batch = await new Promise<FileSystemEntry[]>((resolve) => {
      reader.readEntries(
        (entries) => resolve(entries),
        () => resolve([]),
      );
    });
    if (batch.length === 0) break;
    for (const child of batch) {
      await readAllFiles(child, out, depth + 1);
      if (out.length >= 500) break;
    }
  }
}
