import { describe, it, expect } from 'vitest';
import { buildOutputFileName, resolveUniqueFileName, resolveUniqueFileNames } from '../naming';
import { FORMATS } from '../formats';

describe('resolveUniqueFileName', () => {
  it('无冲突时保持原名', () => {
    expect(resolveUniqueFileName('song.mp3', ['other.mp3'])).toBe('song.mp3');
  });

  it('冲突时在扩展名前递增序号', () => {
    expect(resolveUniqueFileName('song.mp3', ['song.mp3'])).toBe('song (1).mp3');
    expect(resolveUniqueFileName('song.mp3', ['song.mp3', 'song (1).mp3'])).toBe('song (2).mp3');
  });

  it('大小写不敏感比较，避免 Windows 上同名覆盖', () => {
    expect(resolveUniqueFileName('Song.MP3', ['song.mp3'])).toBe('Song (1).MP3');
  });

  it('无扩展名时直接追加序号', () => {
    expect(resolveUniqueFileName('mix', ['mix'])).toBe('mix (1)');
  });

  it('清洗非法字符后再判断冲突', () => {
    expect(resolveUniqueFileName('a<b.mp3', [])).toBe('a_b.mp3');
  });

  it('批量去重保持输入顺序', () => {
    expect(resolveUniqueFileNames(['a.mp3', 'a.mp3', 'b.mp3', 'A.mp3'])).toEqual([
      'a.mp3',
      'a (1).mp3',
      'b.mp3',
      'A (2).mp3',
    ]);
  });
});

describe('buildOutputFileName + 冲突策略', () => {
  const ctx = (index?: number) => ({
    sourceName: 'voice memo',
    sourceFormat: 'wav',
    format: FORMATS.mp3,
    index,
  });

  it('模板中的音频扩展名会被目标格式替换', () => {
    expect(buildOutputFileName('{name}.wav', ctx())).toBe('voice memo.mp3');
  });

  it('模板为空时回退到带序号的名称', () => {
    expect(buildOutputFileName('', ctx(3))).toBe('output_3.mp3');
  });

  it('生成的名称可与已占用集合去重', () => {
    const first = buildOutputFileName('{name}_{format}', ctx());
    expect(resolveUniqueFileName(first, [first])).toBe('voice memo_mp3 (1).mp3');
  });
});
