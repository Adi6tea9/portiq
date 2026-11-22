"use client";

import * as React from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Canvas, useThree } from "@react-three/fiber";
import {
  AdaptiveDpr,
  CameraControls,
  ContactShadows,
  useGLTF,
  useProgress,
} from "@react-three/drei";
import CameraControlsImpl from "camera-controls";
import type { CameraView, ContainerConfig, Parcel } from "@/lib/load-planner/types";
import { VIEW_PRESETS, cameraPose, type WallPart } from "@/lib/load-planner/views";
import { ParcelMeshes } from "./ParcelMeshes";

const FOV = 35;

export interface SceneApi {
  fit: () => void;
  zoom: (direction: 1 | -1) => void;
}

export interface ContainerSceneProps {
  container: ContainerConfig;
  parcels: readonly Parcel[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  view: CameraView;
  cutaway: boolean;
  panMode: boolean;
  reducedMotion: boolean;
  apiRef: React.MutableRefObject<SceneApi | null>;
}

function RoomLighting() {
  const { gl, scene } = useThree();
  React.useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const texture = pmrem.fromScene(room, 0.04).texture;
    scene.environment = texture;
    return () => {
      scene.environment = null;
      texture.dispose();
      room.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

/** Node names in the PortIQ container GLBs for each wall part. */
const PART_NODES: Record<Exclude<WallPart, "nearSide">, string[]> = {
  roof: ["Roof_Panel"],
  frontEnd: ["Front_End_Wall"],
};

function ContainerModel({
  container,
  hidden,
}: {
  container: ContainerConfig;
  hidden: WallPart[];
}) {
  const { scene } = useGLTF(container.modelUrl, false, true);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);

  // The camera sits on the +Z side, so the wall whose centre is past mid-width is the near one.
  const nearSide = React.useMemo(() => {
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const center = new THREE.Vector3();
    for (const side of ["Left", "Right"]) {
      const wall = scene.getObjectByName(`${side}_Side_Wall`);
      if (wall && box.setFromObject(wall).getCenter(center).z > container.width / 2) {
        return [wall, `Exterior_Marking_Side_${side}`, `Exterior_Marking_Owner_${side}`]
          .map((node) => (typeof node === "string" ? scene.getObjectByName(node) : node))
          .filter((node): node is THREE.Object3D => !!node);
      }
    }
    return [];
  }, [scene, container.width]);

  React.useEffect(() => {
    const anisotropy = gl.capabilities.getMaxAnisotropy();
    scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of ([] as THREE.Material[]).concat(mesh.material)) {
        const map = (material as THREE.MeshStandardMaterial).map;
        if (map && material.name.startsWith("Decal") && map.anisotropy !== anisotropy) {
          map.anisotropy = anisotropy;
          map.needsUpdate = true;
        }
      }
    });
  }, [scene, gl]);

  React.useLayoutEffect(() => {
    for (const node of nearSide) node.visible = !hidden.includes("nearSide");
    for (const [part, names] of Object.entries(PART_NODES)) {
      for (const name of names) {
        const node = scene.getObjectByName(name);
        if (node) node.visible = !hidden.includes(part as WallPart);
      }
    }
    invalidate();
  }, [scene, nearSide, hidden, invalidate]);

  return <primitive object={scene} />;
}

function CameraRig({
  container,
  view,
  panMode,
  reducedMotion,
  apiRef,
}: Pick<
  ContainerSceneProps,
  "container" | "view" | "panMode" | "reducedMotion" | "apiRef"
>) {
  const controls = React.useRef<CameraControlsImpl>(null);
  const size = useThree((state) => state.size);
  const aspect = size.width / Math.max(1, size.height);
  const first = React.useRef(true);

  const frame = React.useCallback(
    (animate: boolean) => {
      const { eye, target } = cameraPose(view, container, FOV, aspect);
      void controls.current?.setLookAt(
        eye.x,
        eye.y,
        eye.z,
        target.x,
        target.y,
        target.z,
        animate,
      );
    },
    [view, container, aspect],
  );

  // Re-frame on view or container change only, not on every resize.
  const frameRef = React.useRef(frame);
  frameRef.current = frame;
  React.useEffect(() => {
    frameRef.current(!first.current && !reducedMotion);
    first.current = false;
  }, [view, container, reducedMotion]);

  React.useEffect(() => {
    apiRef.current = {
      fit: () => frameRef.current(!reducedMotion),
      zoom: (direction) => {
        const c = controls.current;
        if (c) void c.dolly(direction * c.distance * 0.25, !reducedMotion);
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, reducedMotion]);

  React.useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const { ACTION } = CameraControlsImpl;
    c.mouseButtons.left = panMode ? ACTION.TRUCK : ACTION.ROTATE;
    c.touches.one = panMode ? ACTION.TOUCH_TRUCK : ACTION.TOUCH_ROTATE;
  }, [panMode]);

  // A plain wheel scrolls the page; Ctrl/⌘ + wheel (and trackpad pinch, which sends ctrlKey) zooms.
  const element = useThree((state) => state.gl.domElement);
  React.useEffect(() => {
    const c = controls.current;
    if (!c) return;
    c.mouseButtons.wheel = CameraControlsImpl.ACTION.NONE;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const step = Math.max(-0.5, Math.min(0.5, -event.deltaY * 0.004));
      void c.dolly(step * c.distance, false);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [element]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      smoothTime={reducedMotion ? 0 : 0.35}
      minDistance={0.3}
      maxDistance={45}
      maxPolarAngle={Math.PI * 0.495}
    />
  );
}

function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
      <span
        role="status"
        className="rounded-full bg-surface/90 px-3 py-1 text-xs font-medium text-muted shadow-sm"
      >
        Loading container model… {Math.round(progress)}%
      </span>
    </div>
  );
}

export default function ContainerScene(props: ContainerSceneProps) {
  const { container, parcels, selectedId, onSelect, view, cutaway } = props;
  const hidden = React.useMemo<WallPart[]>(
    () =>
      cutaway
        ? ["nearSide", "roof", ...VIEW_PRESETS[view].hide]
        : VIEW_PRESETS[view].hide,
    [cutaway, view],
  );

  return (
    <>
      <Canvas
        frameloop="demand"
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ fov: FOV, near: 0.05, far: 200, position: [-8, 4, 9] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.AgXToneMapping;
        }}
        onPointerMissed={(event) => {
          if (event.type === "click") onSelect(null);
        }}
      >
        <RoomLighting />
        <hemisphereLight args={["#ffffff", "#d9d6cc", 0.35]} />
        <directionalLight position={[-6, 9, 7]} intensity={1.3} />
        <React.Suspense fallback={null}>
          <ContainerModel container={container} hidden={hidden} />
          <ContactShadows
            key={container.type}
            position={[container.length / 2, -0.152, container.width / 2]}
            scale={[container.length * 1.4, container.width * 3]}
            resolution={512}
            blur={2.4}
            far={1.2}
            opacity={0.45}
            frames={1}
          />
        </React.Suspense>
        <ParcelMeshes parcels={parcels} selectedId={selectedId} onSelect={onSelect} />
        <CameraRig {...props} />
        <AdaptiveDpr />
      </Canvas>
      <LoadingOverlay />
    </>
  );
}

export function preloadContainerModel(url: string) {
  useGLTF.preload(url, false, true);
}
