import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Aggiungiamo la prop onRollComplete
const DiceArena = ({ activeRolls = [], onRollComplete }) => {
  const canvasRef = useRef(null);
  const processedRolls = useRef(new Set());
  const finishedRolls = useRef(new Set()); // Per non chiamare la callback 100 volte
  
  const animatedObjects = useRef([]);
  const diceGeometryRef = useRef(null);
  
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const tableBounds = useRef({ x: 10, z: 7 }); 

  useEffect(() => {
    if (!canvasRef.current) return;

    if (!sceneRef.current) {
        initScene();
    }

    activeRolls.forEach(roll => {
        if (!processedRolls.current.has(roll.id)) {
            processedRolls.current.add(roll.id);
            // Piccolo ritardo per evitare freeze se arrivano tanti eventi insieme
            setTimeout(() => spawnDicePair(roll), 0);
        }
    });

    let animationId;
    const animate = () => {
        for (let i = animatedObjects.current.length - 1; i >= 0; i--) {
            const obj = animatedObjects.current[i];
            
            if (obj.currentFrame < obj.data.length) {
                // ESEGUE L'ANIMAZIONE
                const frame = obj.data[obj.currentFrame];
                obj.mesh.position.copy(frame.pos);
                obj.mesh.quaternion.copy(frame.quat);
                obj.currentFrame++;
            } else {
                // --- ANIMAZIONE FINITA ---
                
                // Controlliamo se dobbiamo notificare il Game
                if (!finishedRolls.current.has(obj.rollId) && onRollComplete) {
                    finishedRolls.current.add(obj.rollId);
                    
                    // Chiamiamo la funzione passata da Game.jsx!
                    // Passiamo ID, Username e il Totale
                    onRollComplete(obj.rollId, obj.username, obj.totalValue);
                }

                // Pulizia se il roll non è più attivo
                const stillActive = activeRolls.some(r => r.id === obj.rollId);
                if (!stillActive) {
                    sceneRef.current.remove(obj.mesh);
                    animatedObjects.current.splice(i, 1);
                }
            }
        }
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
        animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => cancelAnimationFrame(animationId);
  }, [activeRolls, onRollComplete]); // Aggiunto onRollComplete alle dipendenze

  // ... (TUTTE LE FUNZIONI DI INIT RESTANO IDENTICHE A PRIMA) ...
  // ... Copia initScene, initPhysics, getDiceMesh, ecc. ...
  
  // UNICA MODIFICA A SPAWN: Salvare username e totale nell'oggetto animato
  function spawnDicePair(roll) {
      const limitX = Math.max(1, tableBounds.current.x - 3);
      const startX = (Math.random() - 0.5) * limitX; 
      
      const data1 = simulateAndRecord(roll.dice1, startX - 1.2);
      const data2 = simulateAndRecord(roll.dice2, startX + 1.2);

      if (data1 && data2) {
          addVisualDice(data1, roll, roll.dice1 + roll.dice2); // Passiamo l'oggetto roll intero e il totale
          addVisualDice(data2, roll, roll.dice1 + roll.dice2);
      }
  }

  function addVisualDice(animationData, roll, totalValue) {
      const mesh = getDiceMesh().clone();
      mesh.position.copy(animationData[0].pos);
      mesh.quaternion.copy(animationData[0].quat);
      sceneRef.current.add(mesh);
      
      animatedObjects.current.push({
          mesh: mesh,
          data: animationData,
          currentFrame: 0,
          rollId: roll.id,
          username: roll.username, // Salviamo per la callback
          totalValue: totalValue   // Salviamo per la callback
      });
  }

  // ... (RESTO DEL CODICE UGUALE: simulateAndRecord, checkDieResultVector, ecc.) ...
  
  // INCOLLA QUI SOTTO TUTTE LE FUNZIONI HELPER CHE AVEVI NEL CODICE PRECEDENTE
  // (initScene, initPhysics, getDiceMesh, createComplexDiceGeometry, simulateAndRecord, etc.)
  // Assicurati che siano definite.
  
  // --- HELPERS (Per completezza del copia incolla rapido, ecco le vitali) ---
  
  function initScene() {
      const w = canvasRef.current.clientWidth;
      const h = canvasRef.current.clientHeight;
      rendererRef.current = new THREE.WebGLRenderer({ alpha: true, antialias: true, canvas: canvasRef.current });
      rendererRef.current.shadowMap.enabled = true;
      rendererRef.current.shadowMap.type = THREE.PCFSoftShadowMap;
      rendererRef.current.setSize(w, h);
      rendererRef.current.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      sceneRef.current = new THREE.Scene();
      const CAMERA_HEIGHT = 20; 
      cameraRef.current = new THREE.PerspectiveCamera(40, w/h, 0.1, 100);
      cameraRef.current.position.set(0, CAMERA_HEIGHT, 8); 
      cameraRef.current.lookAt(0, 0, 0);
      // ... Calcolo bounds e luci come prima ...
      const vFOV = (cameraRef.current.fov * Math.PI) / 180;
      const heightVisible = 2 * Math.tan(vFOV / 2) * CAMERA_HEIGHT;
      const widthVisible = heightVisible * (w / h);
      tableBounds.current = { x: (widthVisible / 2) - 1, z: (heightVisible / 2) - 3 };

      const ambientLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.7);
      sceneRef.current.add(ambientLight);
      const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
      mainLight.position.set(5, 20, 5);
      mainLight.castShadow = true;
      mainLight.shadow.mapSize.width = 1024; 
      mainLight.shadow.mapSize.height = 1024;
      sceneRef.current.add(mainLight);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.ShadowMaterial({ opacity: 0.3 }));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      sceneRef.current.add(floor);
  }

  function getDiceMesh() {
      if (!diceGeometryRef.current) diceGeometryRef.current = createComplexDiceGeometry();
      const materialOuter = new THREE.MeshStandardMaterial({ color: 0xfffbf0, roughness: 0.1 });
      const materialInner = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
      const g = new THREE.Group();
      const innerMesh = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.88, 0.88), materialInner);
      const outerMesh = new THREE.Mesh(diceGeometryRef.current, materialOuter);
      outerMesh.castShadow = true;
      outerMesh.receiveShadow = true;
      g.add(innerMesh, outerMesh);
      g.scale.set(1.2, 1.2, 1.2); 
      return g;
  }

  function simulateAndRecord(targetNum, startX) {
      // PARAMETRI VELOCI
      const TOTAL_FRAMES = 150; 
      const WALL_DISTANCE = 9;
      const simWorld = new CANNON.World({ gravity: new CANNON.Vec3(0, -100, 0), allowSleep: true });
      const mat = new CANNON.Material();
      const contact = new CANNON.ContactMaterial(mat, mat, { friction: 0.3, restitution: 0.5 });
      simWorld.addContactMaterial(contact);
      addBoundariesToWorld(simWorld, mat, tableBounds.current.x || 9, tableBounds.current.z || 6);

      let attempts = 0;
      while (attempts < 1000) { 
          attempts++;
          const body = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(0.5,0.5,0.5)), material: mat });
          simWorld.addBody(body);
          body.position.set(startX, 4, (Math.random() - 0.5) * 3);
          body.quaternion.setFromEuler(Math.random()*6, Math.random()*6, Math.random()*6);
          const impulse = new CANNON.Vec3((Math.random() - 0.5) * 8, 5 + Math.random() * 5, (Math.random() - 0.5) * 8);
          const spin = new CANNON.Vec3((Math.random()-0.5)*20, (Math.random()-0.5)*20, (Math.random()-0.5)*20);
          body.angularVelocity.copy(spin);
          body.applyImpulse(impulse, new CANNON.Vec3(0,0,0));

          const recording = [];
          let isValid = true;
          for (let i = 0; i < TOTAL_FRAMES; i++) {
              simWorld.step(1/60);
              recording.push({ pos: body.position.clone(), quat: body.quaternion.clone() });
              if (Math.abs(body.position.x) > (tableBounds.current.x || 9) || Math.abs(body.position.z) > (tableBounds.current.z || 6)) { isValid = false; break; }
          }
          if (isValid && checkDieResultVector(body.quaternion) === targetNum) return recording;
          simWorld.removeBody(body);
      }
      return null;
  }

  function checkDieResultVector(q) {
      const u = new CANNON.Vec3(0, 1, 0);
      const f = [{v:1,n:new CANNON.Vec3(0,1,0)},{v:6,n:new CANNON.Vec3(0,-1,0)},{v:2,n:new CANNON.Vec3(1,0,0)},{v:5,n:new CANNON.Vec3(-1,0,0)},{v:3,n:new CANNON.Vec3(0,0,1)},{v:4,n:new CANNON.Vec3(0,0,-1)}];
      let max=-Infinity, res=1;
      for(let x of f){ let d=q.vmult(x.n).dot(u); if(d>max){max=d; res=x.v;}}
      return res;
  }

  function addBoundariesToWorld(w, m, limitX, limitZ) {
      const p = new CANNON.Plane();
      const floor = new CANNON.Body({ mass:0, shape:p, material:m });
      floor.quaternion.setFromEuler(-Math.PI/2,0,0);
      w.addBody(floor);
      const b = new CANNON.Box(new CANNON.Vec3(20,20,1));
      [[0,0,-limitZ,0,0,0],[0,0,limitZ,0,Math.PI,0],[-limitX,0,0,0,Math.PI/2,0],[limitX,0,0,0,-Math.PI/2,0]].forEach(d=>{
          const wall=new CANNON.Body({mass:0,shape:b,material:m});
          wall.position.set(d[0],d[1],d[2]); wall.quaternion.setFromEuler(d[3],d[4],d[5]); w.addBody(wall);
      });
  }

  function createComplexDiceGeometry() {
        // ... (usa la versione completa data in precedenza) ...
        const params = { segments: 40, edgeRadius: 0.09, notchRadius: 0.14, notchDepth: 0.15 };
        let boxGeometry = new THREE.BoxGeometry(1, 1, 1, params.segments, params.segments, params.segments);
        const positionAttr = boxGeometry.attributes.position;
        const subCubeHalfSize = 0.5 - params.edgeRadius;
        const notchWave = (v) => { v = (1 / params.notchRadius) * v; v = Math.PI * Math.max(-1, Math.min(1, v)); return params.notchDepth * (Math.cos(v) + 1); };
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

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 50 }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

export default DiceArena;