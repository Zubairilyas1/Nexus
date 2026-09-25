'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Text, Line } from '@react-three/drei';
import * as THREE from 'three';

interface Vehicle {
  id: string;
  position: [number, number, number];
  class_name: string;
  speed: number;
  color: string;
}

interface Zone3D {
  id: string;
  label: string;
  points: [number, number][];
  color: string;
  height: number;
}

interface Camera3D {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  fov: number;
  color: string;
}

interface Scene3DProps {
  vehicles: Vehicle[];
  zones: Zone3D[];
  cameras: Camera3D[];
  showGrid?: boolean;
}

function VehicleBox({ vehicle }: { vehicle: Vehicle }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.set(...vehicle.position);
    }
  });

  const size: [number, number, number] = useMemo(() => {
    switch (vehicle.class_name) {
      case 'truck': return [2.5, 1.5, 1.2];
      case 'bus': return [3.5, 1.5, 1.2];
      case 'motorcycle': return [1.2, 0.8, 0.5];
      case 'bicycle': return [1.0, 0.6, 0.3];
      default: return [1.8, 1.0, 0.8]; // car
    }
  }, [vehicle.class_name]);

  return (
    <mesh ref={meshRef} position={vehicle.position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={vehicle.color} />
    </mesh>
  );
}

function ZonePolygon({ zone }: { zone: Zone3D }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    if (zone.points.length > 0 && zone.points[0]) {
      s.moveTo(zone.points[0][0], zone.points[0][1]);
      for (let i = 1; i < zone.points.length; i++) {
        const pt = zone.points[i];
        if (pt) s.lineTo(pt[0], pt[1]);
      }
      s.closePath();
    }
    return s;
  }, [zone.points]);

  const geometry = useMemo(() => {
    const extrudeSettings = { depth: zone.height, bevelEnabled: false };
    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
  }, [shape, zone.height]);

  return (
    <group>
      <mesh geometry={geometry} position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color={zone.color} transparent opacity={0.3} />
      </mesh>
      {zone.points.length > 0 && zone.points[0] && (
        <Line
          points={[...zone.points.map(p => [p[0], p[1], 0] as [number, number, number]), [zone.points[0][0], zone.points[0][1], 0]]}
          color={zone.color}
          lineWidth={2}
        />
      )}
      <Text
        position={[
          zone.points.reduce((sum, p) => sum + p[0], 0) / zone.points.length,
          zone.points.reduce((sum, p) => sum + p[1], 0) / zone.points.length,
          zone.height + 0.5,
        ]}
        fontSize={1.5}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {zone.label}
      </Text>
    </group>
  );
}

function CameraFrustum({ camera }: { camera: Camera3D }) {
  const points = useMemo(() => {
    const [x, y, z] = camera.position;
    const fovRad = (camera.fov * Math.PI) / 180;
    const far = 20;
    const aspect = 16 / 9;
    const halfH = Math.tan(fovRad / 2) * far;
    const halfW = halfH * aspect;

    return [
      [x, y, z] as [number, number, number],
      [x - halfW, y - halfH, z - far] as [number, number, number],
      [x + halfW, y - halfH, z - far] as [number, number, number],
      [x, y, z] as [number, number, number],
      [x - halfW, y + halfH, z - far] as [number, number, number],
      [x + halfW, y + halfH, z - far] as [number, number, number],
      [x, y, z] as [number, number, number],
    ];
  }, [camera]);

  return (
    <group>
      <Line points={points.slice(0, 3)} color={camera.color} lineWidth={1} />
      <Line points={points.slice(3, 5)} color={camera.color} lineWidth={1} />
      <Line points={points.slice(5, 7)} color={camera.color} lineWidth={1} />
      <mesh position={camera.position}>
        <sphereGeometry args={[0.5]} />
        <meshStandardMaterial color={camera.color} />
      </mesh>
      <Text
        position={[camera.position[0], camera.position[1] + 1.5, camera.position[2]]}
        fontSize={1}
        color={camera.color}
        anchorX="center"
      >
        {camera.id}
      </Text>
    </group>
  );
}

function SceneContent({ vehicles, zones, cameras, showGrid }: Scene3DProps) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} intensity={1} />
      <pointLight position={[0, 10, 0]} intensity={0.5} />

      {showGrid && (
        <Grid
          args={[100, 100]}
          cellSize={5}
          cellThickness={0.5}
          cellColor="#444"
          sectionSize={25}
          sectionThickness={1}
          sectionColor="#666"
          fadeDistance={80}
          position={[0, -0.01, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      )}

      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>

      {zones.map(zone => (
        <ZonePolygon key={zone.id} zone={zone} />
      ))}

      {cameras.map(camera => (
        <CameraFrustum key={camera.id} camera={camera} />
      ))}

      {vehicles.map(vehicle => (
        <VehicleBox key={vehicle.id} vehicle={vehicle} />
      ))}

      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        maxPolarAngle={Math.PI / 2.2}
        minDistance={5}
        maxDistance={80}
      />
    </>
  );
}

export function Scene3D({ vehicles, zones, cameras, showGrid = true }: Scene3DProps) {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [30, 25, 30], fov: 60 }}
        gl={{ antialias: true }}
      >
        <SceneContent
          vehicles={vehicles}
          zones={zones}
          cameras={cameras}
          showGrid={showGrid}
        />
      </Canvas>
    </div>
  );
}
