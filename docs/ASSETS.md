# 에셋 확인 (2026-09-14, v0.2 갱신)

PRD([docs/PRD.md](PRD.md)) v0.2 기준 — 생물 시스템 제거, 조개/공격/보스 시스템 반영 후 대조.

## 현재 폴더 구조

```
player/
  otter.glb                                  1.5MB   → 플레이어(수달)
  Clam for attack.glb                        3.5MB   → 조개(공격 자원) 수집 오브젝트
boss/
  boss.glb                                   1.1MB   → 보스(쓰레기봉투)
  trash for attack- 9_gWQWhmmQv.glb          20KB    → 보스가 소환하는 쓰레기 투사체
enemy/
  Shark by Quaternius - sZR8AMLMz5.glb       143KB   → 용도 미정 (아래 참고)
  Rock by J-Toastie - V7cYy0T56b.glb         12KB    → 좌우 회피 장애물(바위)
  Soda Can Crushed by Kenney - MWvBbxYzjJ.glb 17KB   → 점프 회피 장애물(찌그러진 캔)
  log.glb                                    14KB    → 점프 회피 장애물(통나무)
  poop by Tiff Eidmann - 65wuu48mFfG.glb     79KB    → 오염 연출/장애물(배설물)
for stage map edit/
  Nature by 3Donimus - 0nsE2b8uXZy.glb       2.3MB   → 배경 자연물(스테이지1 계곡 등 범용)
  Tree by Poly by Google - 6pwiq7hSrHr.glb   5KB     → 배경 나무
```

## 역할 확정 (v0.2)

| 에셋 | 역할 | 상태 |
|---|---|---|
| `player/otter.glb` | 플레이어 캐릭터 | ✅ 확보 |
| `player/Clam for attack.glb` | 조개 — 수집 시 공격 자원 +1 | ✅ 확보 (역할 확정) |
| `boss/boss.glb` | 보스(쓰레기봉투) | ✅ 확보 (역할 확정) |
| `boss/trash for attack-....glb` | 보스가 필드로 소환하는 투사체 | ✅ 확보 (역할 확정) |
| `enemy/Rock...glb` | 좌우 회피 장애물 | ✅ 확보 |
| `enemy/log.glb` | 점프 회피 장애물 | ✅ 확보 |
| `enemy/Soda Can Crushed...glb` | 점프 회피 장애물 / 공격 파괴 가능 | ✅ 확보 |
| `enemy/poop...glb` | 오염 연출 장애물 | ✅ 확보 |
| `for stage map edit/Nature...glb`, `Tree...glb` | 배경 자연물 (범용) | ✅ 확보 (스테이지 전용 배경은 아님) |
| `enemy/Shark...glb` | **미정** | ⚠️ 아래 참고 |

### `Shark` 처리 필요
생물 시스템을 없앴고 장애물은 "쓰레기·소다캔·배설물" 계열로 정리했다고 하셨는데, 상어는 이 계열에 안 맞습니다. 다음 중 어느 쪽인지 확인 부탁드립니다.
- (a) 안 쓰는 에셋으로 두고 무시
- (b) 그냥 물속 회피 장애물로도 사용 (좌우/잠수 대상)

## 사용자가 추가로 찾아줄 에셋 (요청하신 항목)

- **교각** — 스테이지 2·3 좌우 회피 장애물
- **그물** — 스테이지 2 잠수 회피 장애물
- **집(마을 실루엣)** — 스테이지 3 배경용

## 여전히 비어있는 항목 (v0.1 대비 축소됨)

생물 관련 항목은 전부 제거되어 더 이상 필요 없음. 남은 미확보 항목:

- 스테이지별 전용 배경(장성호 저수지, 읍내 도심 실루엣, 영산강 노을 스카이박스)
- 화물선/바지선, 대형 부유물 (스테이지 4)
- 사운드(BGM/SFX) — 전부 미확보

강물 표현은 에셋으로 구하지 않고 직접 셰이더로 구현하기로 확정 ([docs/PRD.md](PRD.md) 9번 참고).

## 요약

- **바로 쓸 수 있는 것**: 플레이어, 조개, 보스+투사체, 바위, 통나무, 찌그러진 캔, 배설물, 범용 자연 배경 — 스테이지 1은 거의 이 조합만으로 프로토타입 가능
- **확인 필요**: Shark 에셋 용도
- **사용자 확보 예정**: 교각, 그물, 집
- **여전히 미확보**: 스테이지별 전용 배경, 배(화물선/바지선), 사운드

## 프로토타입 v0.1 실행 방법

`index.html`을 그냥 더블클릭해서 열면 모듈 import/glb 로딩이 브라우저 보안 정책(CORS)에 막혀 안 됩니다. 로컬 서버로 띄워야 합니다.

```bash
npx serve .
```
또는
```bash
python -m http.server 8000
```

실행 후 터미널에 나오는 주소(예: `http://localhost:3000`)를 브라우저로 열면 됩니다. PC는 키보드, 게임패드는 연결 후 자동 인식됩니다.

## 다음 단계 (크레딧 여유 있을 때)

1. Shark 용도 확정
2. 교각/그물/집 확보되는 대로 전달 — 확보되면 `enemy/`, `for stage map edit/`에 추가하고 `src/main.js`의 `MODEL_PATHS`, 스테이지별 스폰 테이블에 반영
3. 현재 임시 박스로 구현된 "머리 위 장애물(다리 하부)"을 실제 교각/그물 에셋으로 교체
4. 수치 밸런스(조개 소모량, 공격 쿨다운, 보스 패턴, 유속) 플레이테스트 후 조정
