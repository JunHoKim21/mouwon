# 변경 이력 (CHANGELOG)

## 2026-11-15 — `9dbdc53`
### 추가
- **족욕 단골 NPC 고양이 '솔방울'** (`npc-footbath`, 고등어태비): 족욕 데크 북쪽 좌석(`FOOTBATH_SEAT_SPOTS[4]`)에서 발을 담그고(`footSoak`) 휴식.
  - 기차 놀이 해제 시 남동쪽 산책로 경유 웨이포인트(`25.8, 26.6`)로 귀가.
- **'족욕 개울' 이동 시 자동 착석**: 하단 이동 메뉴에서 선택하면 가장 가까운 빈 편백 좌석으로 걸어가 `footSoak` 자세로 전환.
  - `TeleportSpot.mode`에 `'footSoak'` 추가.

### 제거
- 미사용 `src/components/YarnBallModal.tsx` 삭제.
- `onsenAudio.ts`의 미사용 효과음 `playBambooNote`, `playYarnTick` 제거.
  - `PENTATONIC_BAMBOO_NOTES`, `YARN_MAX_COUNT` 상수는 테스트에서 사용하므로 유지.

### 검증
- `tsc --noEmit` 통과 · 단위 테스트 42/42 통과 · `vite build` 통과.

## 2026-11-14 — `2f6b9ed`
### 추가 / 변경
- 2×6 편백 족욕 데크와 **2단 온천 바위 폭포** 추가 (기존 물레방아 대체).
  - 화산암 언덕, 눈 덮인 바위, 상·중단 옥색 탕, 대나무 물꼭지, 물보라·물결·김 애니메이션.
- 폭포 사운드: 3대역 캐스케이드(310/740/1380Hz) + 1950Hz LPF + 0.14Hz 흐름 LFO.
- 물 걷기 소리를 부드러운 "촤~ 촤~"로 조정 (340Hz HPF, 2150–2550Hz LPF).
- 눈 발자국 소리 음량을 돌길 발자국과 동일한 수준으로 정리.
- 고양이 자세 및 공간 음향 보정.
