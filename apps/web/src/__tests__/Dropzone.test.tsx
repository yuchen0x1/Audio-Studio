import { describe, expect, it, vi } from 'vitest';
import { readAllFiles } from '../platform/readAudioFiles';

function makeFileEntry(name: string): FileSystemFileEntry {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (success) => success(new File(['audio'], name, { type: 'audio/mpeg' })),
  } as FileSystemFileEntry;
}

function makeDirectoryEntry(batches: FileSystemEntry[][]): FileSystemDirectoryEntry {
  const readEntries = vi.fn((success: (entries: FileSystemEntry[]) => void) => {
    success(batches.shift() ?? []);
  });
  return {
    isFile: false,
    isDirectory: true,
    name: 'audio',
    createReader: () => ({ readEntries }) as unknown as FileSystemDirectoryReader,
  } as FileSystemDirectoryEntry;
}

describe('readAllFiles', () => {
  it('reads every batch returned by a directory reader and filters non-audio files', async () => {
    const directory = makeDirectoryEntry([
      [makeFileEntry('first.mp3')],
      [makeFileEntry('notes.txt'), makeFileEntry('second.flac')],
      [],
    ]);
    const output: File[] = [];

    await readAllFiles(directory, output);

    expect(output.map((file) => file.name)).toEqual(['first.mp3', 'second.flac']);
  });

  it('caps directory imports at 500 audio files', async () => {
    const entries = Array.from({ length: 510 }, (_, index) => makeFileEntry(`audio-${index}.wav`));
    const directory = makeDirectoryEntry([entries, []]);
    const output: File[] = [];

    await readAllFiles(directory, output);

    expect(output).toHaveLength(500);
  });
});
