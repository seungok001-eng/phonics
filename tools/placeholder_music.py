# 임시 배경음악 만들기 (진짜 곡이 나오기 전까지 웹 교재의 "음성 나올 때 음악 줄이기"를 시험하기 위한 것).
# 간단한 오르골 풍 아르페지오 16초 반복 → web/assets/music/<이름>.mp3. 실행: python tools/placeholder_music.py
# 진짜 곡(AI 작곡)이 생기면 같은 이름으로 덮어쓰면 된다. content/music.md 에 가사·프롬프트가 있다.
import math, os, struct, subprocess, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'web', 'assets', 'music')
RATE = 32000

NOTE = {'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.0, 'A4': 440.0, 'B4': 493.88, 'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'G5': 783.99}


def pluck(freq, dur, vol=0.3):
    """오르골 음 하나: 사인 + 배음, 빠르게 사그라듦."""
    t = np.linspace(0, dur, int(RATE * dur), endpoint=False)
    env = np.exp(-3.2 * t)
    w = np.sin(2 * math.pi * freq * t) + 0.35 * np.sin(2 * math.pi * freq * 2 * t) + 0.12 * np.sin(2 * math.pi * freq * 3 * t)
    return w * env * vol


def song(chords, bpm=108, bars_each=1, loops=2):
    beat = 60 / bpm
    out = []
    for _ in range(loops):
        for ch in chords:
            for _b in range(bars_each):
                for i in range(8):   # 8분음표 아르페지오
                    n = ch[i % len(ch)]
                    out.append(pluck(NOTE[n], beat * 0.5, 0.28 if i % 2 == 0 else 0.2))
    return np.concatenate(out)


def save(name, data):
    os.makedirs(OUT, exist_ok=True)
    data = np.clip(data, -1, 1)
    wav = os.path.join(OUT, name + '.wav')
    pcm = (data * 32767).astype('<i2').tobytes()
    with open(wav, 'wb') as f:
        f.write(b'RIFF' + struct.pack('<I', 36 + len(pcm)) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, RATE, RATE * 2, 2, 16) + b'data' + struct.pack('<I', len(pcm)) + pcm)
    mp3 = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-q:a', '5', mp3], check=True)
    os.remove(wav)
    print(mp3, os.path.getsize(mp3) // 1024, 'KB')


if __name__ == '__main__':
    # 1유닛 스토리: 밝고 가벼운 C–F–G–C
    save('u1_story', song([['C4', 'E4', 'G4', 'C5'], ['F4', 'A4', 'C5', 'F4'], ['G4', 'B4', 'D5', 'G5'], ['C4', 'E4', 'G4', 'E5']], 108, 1, 2))
    # 0유닛 도입: 조금 신비로운 A단조 느낌
    save('u0_intro', song([['A4', 'C5', 'E5', 'A4'], ['F4', 'A4', 'C5', 'F4'], ['D4', 'F4', 'A4', 'D5'], ['E4', 'G4', 'B4', 'E5']], 96, 1, 2))
