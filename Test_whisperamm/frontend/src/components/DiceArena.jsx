import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const DiceArena = ({ d1, d2, label }) => {
  const canvasRef = useRef(null);
  const processingRef = useRef(null);

  useEffect(() => {
    // 1. Validazione Input: Se mancano i dadi o il canvas, non fare nulla
    if (!canvasRef.current || !d1 || !d2) return;

    // 2. Evita doppio lancio (React StrictMode): usa una chiave unica basata sui dadi
    const rollId = `${d1}-${d2}`;
    if (processingRef.current === rollId) return;
    processingRef.current = rollId;

    // --- CONFIGURAZIONE ---
    const WALL_DISTANCE = 8; 
    const TOTAL_FRAMES = 300; 
    const params = {
      segments: 40,
      edgeRadius: 0.08,
      notchRadius: 0.15,
      notchDepth: 0.17,
    };

    let renderer, scene, camera, diceMesh;
    let visualMeshes = [];
    let animationId;
    let isMounted = true;
    
    // Dati per il playback
    let animationData = []; 
    let currentFrame = 0;

    // --- 1. SETUP GRAFICO ---
    initScene();
    diceMesh = createDiceMeshFactory();

    // Creazione mesh visive (nascoste inizialmente)
    for (let i = 0; i < 2; i++) {
        const mesh = diceMesh.clone();
        mesh.visible = false; 
        scene.add(mesh);
        visualMeshes.push(mesh);
    }

    // --- 2. CALCOLO E REGISTRAZIONE ---
    console.log(`[DiceArena] Simulazione per target: [${d1}, ${d2}]`);

    // Simuliamo separatamente il Dado 1 (d1) e il Dado 2 (d2)
    // d1 parte da sinistra (-2), d2 parte da destra (2)
    const replay1 = simulateAndRecord(d1, -2); 
    const replay2 = simulateAndRecord(d2, 2);  

    if (replay1 && replay2) {
        // Uniamo le due "cassette"
        animationData = mergeReplays(replay1, replay2);
        
        // Start Animazione
        visualMeshes.forEach(m => m.visible = true);
        playAnimation();
    } else {
        console.error("Impossibile trovare una soluzione fisica valida per", d1, d2);
    }

    // --- FUNZIONI ---

    // (La funzione calculateDiceCombination è stata rimossa perché inutile ora)

    // Funzione "Regista": Simula finché non ottiene il numero target
    function simulateAndRecord(targetNum, startX) {
        const simWorld = new CANNON.World({ gravity: new CANNON.Vec3(0, -70, 0), allowSleep: true });
        
        const mat = new CANNON.Material();
        const contact = new CANNON.ContactMaterial(mat, mat, { friction: 0.3, restitution: 0.5 });
        simWorld.addContactMaterial(contact);
        addBoundariesToWorld(simWorld, mat);

        let attempts = 0;
        
        while (attempts < 5000) { 
            attempts++;
            
            const body = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(0.5,0.5,0.5)), material: mat });
            simWorld.addBody(body);

            // Parametri di lancio casuali per naturalezza
            body.position.set(startX, 5, 0);
            body.quaternion.setFromEuler(Math.random()*Math.PI*2, Math.random()*Math.PI*2, Math.random()*Math.PI*2);
            
            const impulse = new CANNON.Vec3(
                (Math.random() - 0.5) * 8,  
                10 + Math.random() * 5,     
                (Math.random() - 0.5) * 8   
            );
            
            const spin = new CANNON.Vec3(
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 20
            );
            
            body.angularVelocity.copy(spin);
            body.applyImpulse(impulse, new CANNON.Vec3(0,0,0));

            const recording = [];
            let isValid = true;
            
            // Registrazione Frame-by-Frame
            for (let i = 0; i < TOTAL_FRAMES; i++) {
                simWorld.step(1/60); 
                
                recording.push({
                    pos: body.position.clone(),
                    quat: body.quaternion.clone()
                });

                if (Math.abs(body.position.x) > WALL_DISTANCE || Math.abs(body.position.z) > WALL_DISTANCE) {
                    isValid = false;
                    break; 
                }
            }

            if (isValid) {
                const result = checkDieResultVector(body.quaternion);
                // Se il risultato corrisponde al dato passato dal backend (d1 o d2)
                if (result === targetNum) {
                    return recording; 
                }
            }
            simWorld.removeBody(body);
        }
        return null; 
    }

    function mergeReplays(rec1, rec2) {
        const length = Math.min(rec1.length, rec2.length);
        const merged = [];
        for (let i = 0; i < length; i++) {
            merged.push([ rec1[i], rec2[i] ]);
        }
        return merged;
    }

    // --- PLAYBACK ---
    function playAnimation() {
        const animate = () => {
            if (!isMounted) return;

            if (currentFrame < animationData.length) {
                const frameData = animationData[currentFrame];
                
                visualMeshes[0].position.copy(frameData[0].pos);
                visualMeshes[0].quaternion.copy(frameData[0].quat);
                
                visualMeshes[1].position.copy(frameData[1].pos);
                visualMeshes[1].quaternion.copy(frameData[1].quat);

                currentFrame++;
                renderer.render(scene, camera);
                animationId = requestAnimationFrame(animate);
            } else {
                renderer.render(scene, camera);
            }
        };
        animate();
    }

    // --- HELPERS (Invariati) ---

    function checkDieResultVector(quaternion) {
        const worldUp = new CANNON.Vec3(0, 1, 0);
        const faces = [
            { value: 1, normal: new CANNON.Vec3(0, 1, 0) },
            { value: 6, normal: new CANNON.Vec3(0, -1, 0) },
            { value: 2, normal: new CANNON.Vec3(1, 0, 0) },
            { value: 5, normal: new CANNON.Vec3(-1, 0, 0) },
            { value: 3, normal: new CANNON.Vec3(0, 0, 1) },
            { value: 4, normal: new CANNON.Vec3(0, 0, -1) }
        ];
        let maxDot = -Infinity;
        let result = 1;
        for (const face of faces) {
            const worldNormal = quaternion.vmult(face.normal);
            const dot = worldNormal.dot(worldUp);
            if (dot > maxDot) { maxDot = dot; result = face.value; }
        }
        return result;
    }

    function addBoundariesToWorld(targetWorld, material) {
        const wallShape = new CANNON.Plane();
        const floorBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: wallShape, material: material });
        floorBody.quaternion.setFromEuler(-0.5 * Math.PI, 0, 0);
        targetWorld.addBody(floorBody);

        const barrierShape = new CANNON.Box(new CANNON.Vec3(10, 10, 1)); 
        const positions = [
            { pos: [0, 0, -WALL_DISTANCE], rot: [0, 0, 0] },
            { pos: [0, 0, WALL_DISTANCE], rot: [0, Math.PI, 0] },
            { pos: [-WALL_DISTANCE, 0, 0], rot: [0, Math.PI/2, 0] },
            { pos: [WALL_DISTANCE, 0, 0], rot: [0, -Math.PI/2, 0] }
        ];
        positions.forEach(p => {
            const wall = new CANNON.Body({ type: CANNON.Body.STATIC, shape: barrierShape, material: material });
            wall.position.set(...p.pos);
            wall.quaternion.setFromEuler(...p.rot);
            targetWorld.addBody(wall);
        });
    }

    function initScene() {
      if (canvasRef.current.childElementCount > 0) canvasRef.current.innerHTML = '';
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, canvas: canvasRef.current });
      renderer.shadowMap.enabled = true;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
      
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(40, canvasRef.current.clientWidth / canvasRef.current.clientHeight, 0.1, 100);
      camera.position.set(0, 18, 10); 
      camera.lookAt(0, 0, 0);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);
      const light = new THREE.PointLight(0xffffff, 800);
      light.position.set(5, 20, 5);
      light.castShadow = true;
      scene.add(light);
      
      const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.ShadowMaterial({ opacity: 0.3 }));
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.receiveShadow = true;
      scene.add(floorMesh);
    }

    function createDiceMeshFactory() {
         const boxMaterialOuter = new THREE.MeshStandardMaterial({ color: 0xffffff }); 
         const boxMaterialInner = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0, metalness: 1 });
         const g = new THREE.Group();
         const innerSide = 1 - params.edgeRadius;
         const innerMesh = new THREE.Mesh(new THREE.BoxGeometry(innerSide, innerSide, innerSide), boxMaterialInner);
         const outerMesh = new THREE.Mesh(createDiceGeometry(), boxMaterialOuter);
         outerMesh.castShadow = true;
         g.add(innerMesh, outerMesh);
         return g;
    }

    function createDiceGeometry() {
        let boxGeometry = new THREE.BoxGeometry(1, 1, 1, params.segments, params.segments, params.segments);
        const positionAttr = boxGeometry.attributes.position;
        const subCubeHalfSize = 0.5 - params.edgeRadius;
        const notchWave = (v) => {
            v = (1 / params.notchRadius) * v;
            v = Math.PI * Math.max(-1, Math.min(1, v));
            return params.notchDepth * (Math.cos(v) + 1);
        };
        const notch = (pos) => notchWave(pos[0]) * notchWave(pos[1]);
        for (let i = 0; i < positionAttr.count; i++) {
            let position = new THREE.Vector3().fromBufferAttribute(positionAttr, i);
            const subCube = new THREE.Vector3(Math.sign(position.x), Math.sign(position.y), Math.sign(position.z)).multiplyScalar(subCubeHalfSize);
            const addition = new THREE.Vector3().subVectors(position, subCube);
            if (Math.abs(position.x) > subCubeHalfSize && Math.abs(position.y) > subCubeHalfSize && Math.abs(position.z) > subCubeHalfSize) { addition.normalize().multiplyScalar(params.edgeRadius); position = subCube.add(addition); } else if (Math.abs(position.x) > subCubeHalfSize && Math.abs(position.y) > subCubeHalfSize) { addition.z = 0; addition.normalize().multiplyScalar(params.edgeRadius); position.x = subCube.x + addition.x; position.y = subCube.y + addition.y; } else if (Math.abs(position.x) > subCubeHalfSize && Math.abs(position.z) > subCubeHalfSize) { addition.y = 0; addition.normalize().multiplyScalar(params.edgeRadius); position.x = subCube.x + addition.x; position.z = subCube.z + addition.z; } else if (Math.abs(position.y) > subCubeHalfSize && Math.abs(position.z) > subCubeHalfSize) { addition.x = 0; addition.normalize().multiplyScalar(params.edgeRadius); position.y = subCube.y + addition.y; position.z = subCube.z + addition.z; }
            const offset = 0.23;
            if (position.y === 0.5) position.y -= notch([position.x, position.z]);
            else if (position.x === 0.5) { position.x -= notch([position.y + offset, position.z + offset]); position.x -= notch([position.y - offset, position.z - offset]); }
            else if (position.z === 0.5) { position.z -= notch([position.x - offset, position.y + offset]); position.z -= notch([position.x, position.y]); position.z -= notch([position.x + offset, position.y - offset]); }
            else if (position.z === -0.5) { position.z += notch([position.x + offset, position.y + offset]); position.z += notch([position.x + offset, position.y - offset]); position.z += notch([position.x - offset, position.y + offset]); position.z += notch([position.x - offset, position.y - offset]); }
            else if (position.x === -0.5) { position.x += notch([position.y + offset, position.z + offset]); position.x += notch([position.y + offset, position.z - offset]); position.x += notch([position.y, position.z]); position.x += notch([position.y - offset, position.z + offset]); position.x += notch([position.y - offset, position.z - offset]); }
            else if (position.y === -0.5) { position.y += notch([position.x + offset, position.z + offset]); position.y += notch([position.x + offset, position.z]); position.y += notch([position.x + offset, position.z - offset]); position.y += notch([position.x - offset, position.z + offset]); position.y += notch([position.x - offset, position.z]); position.y += notch([position.x - offset, position.z - offset]); }
            positionAttr.setXYZ(i, position.x, position.y, position.z);
        }
        boxGeometry.deleteAttribute("normal"); boxGeometry.deleteAttribute("uv");
        boxGeometry = mergeVertices(boxGeometry); boxGeometry.computeVertexNormals();
        return boxGeometry;
    }

    // CLEANUP
    return () => {
        isMounted = false;
        processingRef.current = null;
        cancelAnimationFrame(animationId);
        if (renderer) renderer.dispose();
    };

  }, [d1, d2]); // La dipendenza ora è sui singoli dadi

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {label && (
            <div style={{
                position: 'absolute', top: 10, width: '100%', textAlign: 'center',
                color: 'white', fontWeight: 'bold', textShadow: '0 2px 4px rgba(0,0,0,0.5)', zIndex: 10,
                fontSize: '1.5rem', fontFamily: 'sans-serif'
            }}>
                {label} sta lanciando...
            </div>
        )}
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
};

export default DiceArena;