import './Kirby.css'
import {useEffect, useRef, useState} from 'react'
import {Canvas, useFrame, useThree} from '@react-three/fiber'
import {OrbitControls, useGLTF, Environment, useAnimations} from '@react-three/drei'
import {ACESFilmicToneMapping, LoopOnce, LoopRepeat, MathUtils, Quaternion, Vector3} from 'three'
import kirby from './assets/kirby3d.glb?url'
import bgUrl from './assets/kibg.jpg?url'

function KirbyModel({
                        scale = 1,
                        // jump
                        jumpKey,
                        jumpHeight = 0.6,
                        jumpDuration = 0.5,
                        // walk
                        walkKey,
                        leftX = -5,
                        rightX = 5,
                        walkSpeed = 20,
                        turnDuration = 0.35,
                        returnToFront = true,
                        forwardDistance = 0.01,
                        // step
                        stepSize = 2 // 0이면 비활성화, >0이면 해당 간격으로 스냅
                    }) {
    const group = useRef()
    const { scene, animations } = useGLTF(kirby)
    const { actions } = useAnimations(animations, group)
    const { camera } = useThree()

    // base transforms
    const baseYRef = useRef(null)
    const baseQuatRef = useRef(null)

    // jump
    const jumpStartRef = useRef(0)
    const jumpingRef = useRef(false)

    // walk
    const walkingRef = useRef(false)
    const walkStateRef = useRef('idle') // 'turnSide' | 'moveToX' | 'turnFront' | 'done'
    const turnStartRef = useRef(0)
    const turnFromRef = useRef(new Quaternion())
    const turnToRef = useRef(new Quaternion())

    // 전진 목표 관리
    const moveStartXRef = useRef(0)
    const forwardTargetXRef = useRef(0)

    // helpers
    const yAxis = new Vector3(0, 1, 0)
    const isFiniteNum = (v) => Number.isFinite(v)
    const quantizeToStep = (val, step) => step > 0 ? Math.round(val / step) * step : val
    const ceilToStep = (val, step) => Math.ceil(val / step) * step
    const floorToStep = (val, step) => Math.floor(val / step) * step

    // init
    useEffect(() => {
        if (!group.current) return
        group.current.position.set(0, -6, 0)
        baseYRef.current = group.current.position.y

        group.current.lookAt(camera.position)
        group.current.rotateX(MathUtils.degToRad(15))

        baseQuatRef.current = group.current.quaternion.clone()
    }, [camera])

    // Jump trigger
    useEffect(() => {
        if (!group.current) return
        if (jumpKey == null) return
        if (walkingRef.current) return
        if (jumpingRef.current) return
        jumpStartRef.current = performance.now()
        jumpingRef.current = true

        if (actions) {
            const keys = Object.keys(actions || {})
            const key = keys.find(k => k.toLowerCase().includes('jump')) || null
            const action = key ? actions[key] : null
            if (action) {
                action.reset()
                action.setLoop(LoopOnce, 1)
                action.clampWhenFinished = true
                action.fadeIn(0.1)
                action.play()
            }
        }
    }, [jumpKey, actions])

    // Jump animation
    useFrame(() => {
        if (!jumpingRef.current || !group.current || baseYRef.current == null) return
        const t = (performance.now() - jumpStartRef.current) / 1000
        const progress = Math.min(t / jumpDuration, 1)
        const y = baseYRef.current + jumpHeight * Math.sin(Math.PI * progress)
        group.current.position.y = y
        if (progress >= 1) {
            group.current.position.y = baseYRef.current
            jumpingRef.current = false
        }
    })

    // Walk helpers
    const playWalk = (fadeIn = 0.12, speed = 1) => {
        if (!actions) return
        const keys = Object.keys(actions || {})
        const key = keys.find(k => k.toLowerCase().includes('walk')) || keys[0]
        const action = key ? actions[key] : null
        if (!action) return
        action.reset()
        action.setLoop(LoopRepeat, Infinity)
        action.clampWhenFinished = false
        action.timeScale = speed
        action.fadeIn(fadeIn)
        action.play()
    }

    const stopWalk = (fadeOut = 0.15) => {
        if (!actions) return
        const keys = Object.keys(actions || {})
        const key = keys.find(k => k.toLowerCase().includes('walk')) || keys[0]
        const action = key ? actions[key] : null
        if (!action) return
        action.fadeOut(fadeOut)
    }

    const setupTurn = (yawDeg) => {
        const qYaw = new Quaternion().setFromAxisAngle(yAxis, MathUtils.degToRad(yawDeg))
        turnFromRef.current.copy(group.current.quaternion)
        const base = baseQuatRef.current || group.current.quaternion
        turnToRef.current.copy(qYaw).multiply(base)
        turnStartRef.current = performance.now()
    }

    // Walk trigger: 현재 X와 leftX/rightX를 비교해 목표 X를 정하고 그쪽을 바라본 뒤 이동
    useEffect(() => {
        if (!group.current) return
        if (walkKey == null) return
        if (walkingRef.current) return

        walkingRef.current = true

        const currX = group.current.position.x
        const hasEndpoints = isFiniteNum(leftX) && isFiniteNum(rightX) && leftX !== rightX

        let targetX
        if (hasEndpoints) {
            const distL = Math.abs(currX - leftX)
            const distR = Math.abs(currX - rightX)
            if (distL < 1e-3) targetX = rightX
            else if (distR < 1e-3) targetX = leftX
            else targetX = distL < distR ? rightX : leftX
        } else {
            targetX = currX + Math.sign(forwardDistance || 0) * Math.abs(forwardDistance || 0)
        }

        // stepSize가 있으면 목표도 스텝 그리드에 스냅
        if (stepSize > 0) {
            const dir = Math.sign(targetX - currX) || 1
            const snapped = quantizeToStep(targetX, stepSize)
            // 스냅 후 목표가 현재와 같다면 진행 방향으로 한 칸 밀기
            targetX = (Math.abs(snapped - currX) < 1e-9)
                ? currX + dir * stepSize
                : snapped
        }

        // 목표 X의 부호에 따라 Yaw 설정 (+X: +90°, -X: -90°)
        const yawDeg = targetX > currX ? +90 : -90
        setupTurn(yawDeg)

        forwardTargetXRef.current = targetX
        walkStateRef.current = 'turnSide'
    }, [walkKey, leftX, rightX, forwardDistance, stepSize])

    // Walk state machine
    useFrame((state) => {
        if (!walkingRef.current || !group.current) return
        const now = performance.now()
        const delta = state.clock.getDelta()

        const slerpByTime = () => {
            const p = Math.min((now - turnStartRef.current) / (turnDuration * 1000), 1)
            const q = new Quaternion().copy(turnFromRef.current).slerp(turnToRef.current, p)
            group.current.quaternion.copy(q)
            return p >= 1
        }

        const EPS = Math.max(1e-4, stepSize > 0 ? stepSize * 0.25 : 0)

        switch (walkStateRef.current) {
            case 'turnSide': {
                if (slerpByTime()) {
                    playWalk(0.1, 1)
                    moveStartXRef.current = group.current.position.x
                    walkStateRef.current = 'moveToX'
                }
                break
            }
            case 'moveToX': {
                const targetX = forwardTargetXRef.current
                const currX = group.current.position.x
                const dir = Math.sign(targetX - currX) || 1

                // 오버슈팅 방지: 이번 프레임 이동량을 남은 거리로 캡
                const remaining = Math.abs(targetX - currX)
                let step = Math.min((walkSpeed ?? 2.5) * delta, remaining) // walkSpeed는 "초당 유닛"
                let newX = currX + dir * step

                // stepSize가 있으면 스텝 그리드로 스냅하면서 진행
                if (stepSize > 0) {
                    // 진행 방향으로 다음 스텝 경계까지 스냅
                    const snapped =
                        dir > 0
                            ? Math.min(targetX, ceilToStep(newX, stepSize))
                            : Math.max(targetX, floorToStep(newX, stepSize))

                    // 스냅 결과가 현재와 같아 멈추는 경우, 최소 한 칸은 전진
                    if (Math.abs(snapped - currX) < EPS) {
                        const next = currX + dir * stepSize
                        newX = dir > 0 ? Math.min(next, targetX) : Math.max(next, targetX)
                    } else {
                        newX = snapped
                    }
                }

                group.current.position.x = newX

                const afterRemaining = Math.abs(targetX - group.current.position.x)
                if (afterRemaining <= EPS) {
                    // 정확히(또는 충분히 가깝게) 도달
                    group.current.position.x = targetX
                    stopWalk(0.12)
                    if (returnToFront) {
                        // 정면 복귀
                        turnFromRef.current.copy(group.current.quaternion)
                        turnToRef.current.copy(baseQuatRef.current || group.current.quaternion)
                        turnStartRef.current = performance.now()
                        walkStateRef.current = 'turnFront'
                    } else {
                        walkStateRef.current = 'done'
                    }
                }
                break
            }

            case 'turnFront': {
                if (slerpByTime()) {
                    walkStateRef.current = 'done'
                }
                break
            }
            case 'done': {
                walkingRef.current = false
                walkStateRef.current = 'idle'
                break
            }
            default:
                break
        }
    })

    return (
        <group ref={group} scale={scale}>
            <primitive object={scene} />
        </group>
    )
}

useGLTF.preload(kirby)

export default function Kirby() {
    const [jumpKey, setJumpKey] = useState(null)
    const [walkKey, setWalkKey] = useState(null)

    // 15° 올려다보기: z 거리(d)=4.73일 때 y ≈ -6.77
    const target = [0, -2, 0]
    const cameraPos = [0, -6.77, 20]

    return (
        <>
            <div
                style={{
                    height: '100vh',
                    backgroundImage: `url(${bgUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat'
                }}
            >
                <Canvas
                    camera={{ position: cameraPos, fov: 50 }}
                    gl={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
                >
                    <ambientLight intensity={0.7} />
                    <directionalLight position={[3, 5, 2]} intensity={2.2} />
                    <Environment preset="sunset" />

                    <KirbyModel
                        scale={1}
                        jumpKey={jumpKey}
                        jumpHeight={0.6}
                        jumpDuration={0.5}
                        walkKey={walkKey}
                        leftX={-5}
                        rightX={5}
                        walkSpeed={20}
                        turnDuration={0.35}
                        returnToFront={true}
                        forwardDistance={0.01} // x축 전진 거리
                        stepSize={0.03} // 스텝 사이즈(예: 0.25 유닛). 0이면 비활성화
                    />

                    <OrbitControls makeDefault target={target} enableZoom={false}/>
                </Canvas>
            </div>
            <h2 className="action-text">Hey Kirby!</h2>
            <button
                className="action-btn"
                onClick={() => setJumpKey(k => (k ?? 0) + 1)}
            >
                Jump
            </button>
            <button
                className="action-btn"
                style={{ left: '55%' }}
                onClick={() => setWalkKey(k => (k ?? 0) + 1)}
            >
                Walk
            </button>
        </>
    )
}