# REA 힐링 3D 웹앱 프로젝트 통합 인계 문서 (HANDOFF)

> 작성일: 2026-11-13  
> 목적: 기존 대화창에서 수행한 `sansatemple.com` REA 역공학 기술 분석, 테마 A/B 기획·구현·디버깅 교훈, ‘발레 블랙노즈 양’ 전문가 토론 결과를 새 대화창으로 누락 없이 이관하기 위한 기준 문서입니다.

---

## 1. 워크스페이스 및 기획서 위치

| 구분 | 경로 | 설명 |
| :--- | :--- | :--- |
| **인계 문서 (본 파일)** | `c:\jun\REA\HANDOFF.md` | 전체 기술 분석·구현·교훈·의사결정 요약 |
| **테마 A 기획서** | `c:\jun\REA\cat_onsen_master_plan.md` | 『고양이 온천 여관 : 묘유원(猫湯院)』 마스터 기획서 |
| **테마 B 기획서** | `c:\jun\REA\camp_bonfire_master_plan.md` | 『카피바라 & 리트리버 모닥불 야영장 : 유유원(悠悠院)』 마스터 기획서 |
| **테마 A 프로젝트** | `c:\jun\REA\cat-onsen` | Three.js + Vite 프로시저럴 고양이 온천 웹앱 |
| **테마 B 프로젝트** | `c:\jun\REA\camp-bonfire` | Three.js + Vite 프로시저럴 모닥불 야영장 웹앱 |

---

## 2. 원본 레퍼런스(`sansatemple.com`) REA 역공학 핵심 기술 스펙

`https://sansatemple.com/`(산사 — "말없이 같이 앉아 있는 온라인 절")을 REA 파이프라인으로 분석해 추출한 핵심 파라미터입니다.

### 2.1 카메라 & 뷰포트 (원근 왜곡·멀미 방지)
* **기본 카메라**: `new THREE.PerspectiveCamera(64, 1, 0.08, 280)`
* **반응형 FOV**:
  * 가로형(`visibleAspect >= 0.8`): **64°**
  * 세로형 모바일(`visibleAspect < 0.8`): **68°**
  * 모달/클로즈업 전용: **38°** (`near = 0.1, far = 30`)
* **기본 거리 & 피치**:
  * `distance`: 기본 **`3.85m`** (휠 줌 범위 **`2.2m ~ 14.0m`**)
  * `pitch`: 기본 **`0.015`** (범위 `-0.24 ~ 0.31`, 벤치 착석 시 `-0.12 ~ 1.12`)
  * 포인터 감도: `yaw -= dx * 0.0034`, `pitch += dy * 0.0022` (수직 감도를 수평 대비 64.7%로 억제)
* **전방 주시점 & 부각**:
  * 캐릭터 발바닥 $(x, y, z)$ 기준 카메라 $\mathbf{P}_{\text{cam}}$은 뒤로 $+d$, 주시점 $\mathbf{P}_{\text{look}}$은 캐릭터 앞쪽 $3\text{m}$ 지점(`-3 * sin(yaw)`, `-3 * cos(yaw)`)으로 길게 빼서 회전 멀미를 줄임.
  * PC 가로 기준 약 `6.83°` 완만한 부각, 모바일 세로 약 `15.27°` 쿼터뷰, 줌아웃 시 자동 고도 상승(`max(0, d - 3.85) * 0.22`).
* **멀미 방지 감쇠**:
  * 카메라 보간: `lerpFactor = 1 - Math.exp(-dt * 7)`
  * 지형 높이 추종: `THREE.MathUtils.damp(y, floorHeight, 12, dt)`

### 2.2 조명(Lighting), 색감(Fog), 커스텀 셰이더
* **광원 구성**:
  * `HemisphereLight`: 낮 `0.78` (`#dde6ec` / `#a69b85`) ↔ 밤 `0.62` (`#adbcdb` / `#8f9b8c`)
  * `AmbientLight`: 낮 `0.15` (`#f6eee3`, 그림자 대비 확보) ↔ 밤 `0.42` (`#efd2c4`, 야간 시인성 확보)
  * `DirectionalLight`: 위치 `(-36, 34.5, 32)` → `(0, 0, -4)`, 낮 `2.08` (`#fff0d8`) ↔ 밤 `0.48` (`#b2c0e5`), 그림자 `PCFSoftShadowMap` (`2048×2048` / `3072×3072`, `bias: -0.0005`, `normalBias: 0.075`, `radius: 4`)
* **이중 연무(Fog) 구조**:
  * 씬 기본 `THREE.Fog`: `near = 95m`, `far = 232m` (낮 `#aabbbd` ↔ 밤 `#343a50`)
  * 원경 지형 전용 `onBeforeCompile` 연무(`landscapeFade`): `smoothstep(88.0, 232.0, floorDistance)`에 경사도(`floorSlope`) 감쇠(`mix(1.0, 0.48, smoothstep(0.09, 0.48, floorSlope))`)를 곱해 먼 산 능선 실루엣을 수묵담채화처럼 유지.
* **루마(휘도)·채도 정규화 PBR 셰이더 (`onBeforeCompile`)**:
  * `#include <map_fragment>` 직후에 표면 평균 휘도(`mean`), 대비(`variation`), 채도(`saturation`), `gain`을 적용해 지나친 사진 질감을 누르고 따뜻한 로우폴리/회화 톤을 유지.
* **렌더러 파이프라인**:
  * `SRGBColorSpace`, `ACESFilmicToneMapping` (`toneMappingExposure = 1.0`)
  * `devicePixelRatio` 상한: 모바일 `1.6`, 데스크톱 `1.75`
  * 적응형 프레임 페이서: 기본 30 FPS (다수 오브젝트/원거리 부하 시 15 FPS)
  * 접촉 그림자(`contactShadow`): 발밑 실시간 그림자 대신 Canvas 라디얼 그라디언트 데칼 사용.

### 2.3 Web Audio 하이브리드 사운드 엔진
* **마스터 체인**: `Ambience Bus` + `Effects Bus` → `Dry Bus` → `DynamicsCompressor (-14dB, knee 18dB, ratio 3.5:1)` → `Master Gain (0.45)` → `destination`
* **컨볼루션 리버브 (`makeImpulse`)**: 1.7초 스테레오 임펄스 응답 자체 합성 (`pre-delay 28ms`, 감쇠 `exp(-(t-0.028)*5.7)`, `LPF 4200Hz`, `gain 0.38`)
* **보이스 스틸링**: 동시 발음 `14개` 이상이면 가장 오래된 보이스를 `18ms` 페이드아웃 후 회수.
* **절차적 앰비언스**:
  * 바람: 9.7초 핑크 노이즈 루프(2048샘플 크로스페이드) + `HPF 260Hz` → `LPF 1330Hz` + LFO 2종(`0.037Hz` 음량, `0.059Hz` 컷오프)
  * 물/강물: 5.4초 핑크 노이즈 루프 × 3대역(`490Hz`, `1260Hz`, `2080Hz`), 배속(`0.87x`, `1.27x`, `1.64x`)을 달리해 폴리리듬 형성.
  * 거리 감쇠 및 상호작용 음향: 펜타토닉 스케일(`C - D - E - G - A`) 고정으로 다중 입력 시 불협화음 방지.

---

## 3. 테마 A & 테마 B 구현 현황 및 검증 상태

### 3.1 테마 A: 『묘유원(猫湯院)』 (`c:\jun\REA\cat-onsen`)
* 설경 삼나무 숲 노천탕, 유자/수건 올린 고양이 아바타(식빵 굽기, 물멍, 유자 띄우기, 우유 자판기/평상 휴식).
* 해결한 UI 버그:
  * CSS `display: flex`가 HTML `[hidden]` 속성을 덮어쓰던 문제 수정(`[hidden] { display: none !important; }`).
  * 평상 착석 시 하단 상태 바(`bench-context-bar`)와 4버튼 액션 독이 겹치던 UI 레이아웃 수정.

### 3.2 테마 B: 『유유원(悠悠院)』 (`c:\jun\REA\camp-bonfire`)
* 카피바라·리트리버·레서판다·오리 아바타, 카피바라 기차(`CapybaraTrain`: `follow` / `circle`), 통나무 벤치, 마시멜로 굽기, 솔방울 화력, 5음 칼림바, 호숫가 카누 물멍.
* **전수검사 및 `/swarm` 수정 완료 내역 (2026-11-12)**:
  * `src/world/animalAvatars.js`: `DuckAvatar`에 `this.rig.rotation.y = Math.PI` 추가, `RedPandaAvatar`/`DuckAvatar`에 `greet()`/`setEyesClosed()` 구현 및 `createAnimalAvatar()`의 `greetTimer` 덮어쓰기 버그 수정, `CapybaraTrain.updateCircleMode()` 접선각을 `Math.atan2(-Math.sin(angle), Math.cos(angle))`로 보정, `updateFollowMode()` 대기열 겹침 방지 및 `dir` 계산 후 `lerp` 수행.
  * `src/world/bonfireWorld.js`: 화덕 돌/장작/삼각대/주전자/꼬치의 `castShadow` 해제 + `campfireLight` 상향(`y = 1.32`) + `campfireFillLight` 추가로 야간 모닥불 그림자 차폐 해소, 통나무 벤치 `campAction: "sitLog"` / `seatY: 0.65` 등록.
  * `src/main.js`, `src/style.css`: `animate()`에서 `updatePlayerMovement()`를 `train.update()`보다 먼저 실행, `sitOnLogBench()` 착석 높이(`0.65`) 수정, `switchAnimalSpecies()` GPU 리소스 해제(`disposeObjectResources`) 및 리더 재연결, `.ctx-btn-train.is-active` 상태 동기화.
  * 검증 결과: `npm run build` (`vite build`, exit 0, `dist/assets/index-pN7Ryrq8.js 622.77 kB`), `node --check` 및 `node --input-type=module` 정적/각도/DOM ID(`56`개 중 누락 `0`) 검증 통과. *(실제 브라우저 실행 플레이 테스트는 사용자 로컬 확인 필요)*

---

## 4. 실전 개발 시 반드시 지켜야 할 기술 교훈

1. **아바타 전방 축 규약 통일**: 로컬 지오메트리가 `-Z`를 바라보도록 모델링했다면, 월드 이동 방향(`+Z` 기준 `Math.atan2(dx, dz)`)과 맞추기 위해 생성자에서 반드시 `this.rig.rotation.y = Math.PI;`를 적용해야 뒤로 걷지 않는다.
2. **추적/궤도 회전 수학**: 원형 궤도 `pos = (cos(θ), sin(θ))`의 진행 방향 벡터는 `(-sin(θ), cos(θ))`이므로 회전각은 `Math.atan2(-Math.sin(θ), Math.cos(θ))`(= `-θ`)여야 한다.
3. **야간 `PointLight` 그림자 차폐**: 모닥불/랜턴 주변에 `castShadow = true`인 낮은 돌·프롭이 광원을 둘러싸면 바닥과 캐릭터 전체가 검은 그림자 링에 갇힌다. 작은 장식물/화덕 돌은 `castShadow = false`로 두고 비그림자 Fill Light를 병용한다.
4. **루프 실행 순서**: `updatePlayerMovement()` → `train.update()` → `updateCamera()` 순서를 지켜야 1프레임 지연과 덜컹거림이 없다.
5. **CSS `[hidden]` 및 상태 동기화**: Flex/Grid 컨테이너에는 `[hidden] { display: none !important; }`를 명시하고, 액션 버튼은 기본 중립 스타일 + `.is-active` 클래스로만 강조한다.
6. **환경 규칙**: AI는 절대 `./gradlew bootrun`이나 `vite` 개발 서버를 백그라운드 데몬으로 직접 띄우지 않는다.

---

## 5. 신규 후보: ‘발레 블랙노즈 양’ 테마 전문가 토론 결론

트렌드·마케팅, 3D 아트, 힐링 UX, 프로덕트 총괄 비평가 4인 토론 결과:
* **핵심 판정**: **단독 3번째 신규 프로젝트(테마 C)로 처음부터 새로 파는 것은 비추천.**
* **주요 리스크**:
  1. **마케팅**: 고양이/카피바라 대비 ‘신기한 숏폼 짤’ 성향(B+급)이며, ‘숀더쉽’과 혼동되기 쉽다.
  2. **3D 비주얼**: 얼굴 전체가 검정(`#111~#222`)이라 웹 3D 조명/그림자 아래서 눈·코가 뭉개지는 **블랙아웃(텍스처 버그 오인) 위험**이 매우 크고, 코드 기반 솜털(Sphere 다수 결합)은 포도송이처럼 조잡해지거나 성능이 떨어지기 쉽다.
  3. **UX**: 또 ‘배경+동물만 바꾼 멍때리기 뷰어’가 되면 피로감이 온다.
* **권장 실행 옵션 3가지**:
  1. **(최우선 추천)** `camp-bonfire`의 선택 가능 동물에 ‘블랙노즈 양’을 스페셜/친구 캐릭터로 편입(딥 차콜 `#22232a` + 림라이트 + 눈 펄 하이라이트 적용).
  2. **(새 씬을 꼭 원한다면)** 낮 시간대 알프스 초원 + 카우벨 합주 + **드래그 양떼 몰기 / 털 빗질·깎기 ASMR** 등 ‘능동적 손맛’ 중심으로 기획하거나 기존 서비스 내 Scene Switcher로 통합.
  3. **(고도화)** 신규 테마 대신 `cat-onsen` / `camp-bonfire`의 완성도를 대표작 수준으로 끌어올림.

---

## 6. 새 대화창 시작용 프롬프트 (복붙용)

```text
c:\jun\REA\HANDOFF.md 를 먼저 읽고 전체 기술 분석, 프로젝트 현황, 기술 교훈, 블랙노즈 양 토론 결과를 파악해줘.
(필요하면 c:\jun\REA\cat_onsen_master_plan.md 와 c:\jun\REA\camp_bonfire_master_plan.md 도 참고해.)
파악이 끝나면 이번 대화창에서는 [원하는 작업 입력]을 진행하자.
```
