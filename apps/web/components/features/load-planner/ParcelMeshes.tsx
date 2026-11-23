"use client";

import * as React from "react";
import * as THREE from "three";
import { Edges, Html, Outlines } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { CARGO_CATEGORIES } from "@/lib/load-planner/config";
import type { Parcel } from "@/lib/load-planner/types";

const SELECT_COLOR = "#1f9d6b";
/** Pointer travel (px) above which a click is treated as a camera drag. */
const DRAG_TOLERANCE = 5;

// One geometry per shape, scaled per parcel, so 100 parcels cost 2 geometries.
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);

const MATERIALS = new Map<string, THREE.MeshStandardMaterial>();
function materialFor(categoryId: string, state: "idle" | "hover" | "selected") {
  const key = `${categoryId}:${state}`;
  let material = MATERIALS.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color: CARGO_CATEGORIES[categoryId]?.color ?? "#b8b2a6",
      roughness: categoryId === "drum" ? 0.45 : 0.85,
      metalness: categoryId === "drum" ? 0.25 : 0,
      emissive: state === "idle" ? "#000000" : SELECT_COLOR,
      emissiveIntensity: state === "selected" ? 0.22 : 0.12,
    });
    MATERIALS.set(key, material);
  }
  return material;
}

interface ParcelMeshesProps {
  parcels: readonly Parcel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ParcelMeshes({ parcels, selectedId, onSelect }: ParcelMeshesProps) {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  React.useEffect(() => {
    document.body.style.cursor = hoveredId ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hoveredId]);

  return (
    <group>
      {parcels.map((parcel) => {
        const selected = parcel.id === selectedId;
        const state = selected ? "selected" : parcel.id === hoveredId ? "hover" : "idle";
        const cylinder = CARGO_CATEGORIES[parcel.categoryId]?.shape === "cylinder";
        return (
          <group
            key={parcel.id}
            position={[
              parcel.position.x + parcel.length / 2,
              parcel.position.y + parcel.height / 2,
              parcel.position.z + parcel.width / 2,
            ]}
          >
            <mesh
              geometry={cylinder ? CYLINDER : BOX}
              material={materialFor(parcel.categoryId, state)}
              scale={[parcel.length * 0.985, parcel.height * 0.985, parcel.width * 0.985]}
              onClick={(event: ThreeEvent<MouseEvent>) => {
                if (parcel.locked) return;
                if (event.delta > DRAG_TOLERANCE) return;
                event.stopPropagation();
                onSelect(parcel.id);
              }}
              onPointerOver={(event) => {
                event.stopPropagation();
                if (parcel.locked) return;
                setHoveredId(parcel.id);
              }}
              onPointerOut={() =>
                setHoveredId((current) => (current === parcel.id ? null : current))
              }
            >
              {!cylinder && (
                <Edges threshold={20} color={selected ? SELECT_COLOR : "#7a6243"} />
              )}
              {selected && (
                <Outlines thickness={0.025} color={SELECT_COLOR} screenspace={false} />
              )}
            </mesh>
            {selected && (
              <Html
                position={[0, parcel.height / 2 + 0.18, 0]}
                center
                zIndexRange={[20, 0]}
              >
                <span className="pointer-events-none whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white shadow">
                  {parcel.label ?? parcel.id}
                </span>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}
