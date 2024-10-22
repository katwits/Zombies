import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import {PointerLockControls} from 'three/examples/jsm/controls/PointerLockControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import * as CANNON from 'cannon';


// Loading Manager to track progress
const loadingManager = new THREE.LoadingManager(
    () => {
        // Hide loading screen when loading is complete
        document.getElementById('loading-screen').style.display = 'none';
    },
    (itemUrl, itemsLoaded, itemsTotal) => {
        // Update the progress bar
        const progress = (itemsLoaded / itemsTotal) * 100;
        document.getElementById('progress-bar').style.width = `${progress}%`;
    }
);

let sun, moon, sunMesh, moonMesh,  sky, clouds, stars, terrainGeometry;
let daySkyMaterial, nightSkyMaterial;
let playerLife = 5; // Player starts with 5 life points
let moveSpeed = 20;
let kills = 0;
let currentLevel = 1;
let isGameOver = false;
let gameOverScreen;
let isPaused = false; // Game pause state
const pauseSign = document.getElementById('pauseSign');
const playSign = document.getElementById('playSign');


const powerUps = []; // Array to store active power-ups


function pauseGame() {
    isPaused = true; // Set the pause state to true
    pauseSign.style.display = 'block'; // Show the pause sign
        playSign.style.display = 'none'; // Hide the play sign
        clock.stop(); // Stop the clock when paused
    console.log('Game Paused');
    // Optionally, display a pause menu or overlay here
}

// Function to resume the game
function resumeGame() {
    isPaused = false; // Set the pause state to false
    console.log('Game Resumed');
    pauseSign.style.display = 'none'; // Hide the pause sign
        playSign.style.display = 'block'; // Show the play sign
        clock.start(); // Resume the clock
        
        // Hide the play sign after 1 second
        setTimeout(() => {
            playSign.style.display = 'none'; // Hide the play sign after 1 second
        }, 1000);
    animate(); // Restart the render loop
}


const powerUpTypes = {
    ZOMBIE_SLOWDOWN: 'zombieSlowdown',
    PLAYER_SPEEDUP: 'playerSpeedup',
    HEALTH_BOOST: 'healthBoost',
};

class PowerUp {
    constructor(type, position,scene) {
        this.type = type;
        this.position = position;
        this.isActive = true;
        this.scene = scene

        
        this.mesh =null;
        this.loadModel(loadPowerUp);
      

       
    }

    loadModel(loader) {
        let scalar,modelPath;

        // Define the path to the 3D model file based on power-up type
        switch (this.type) {
            case powerUpTypes.ZOMBIE_SLOWDOWN:
                modelPath = './shell.glb'; // Path to zombie slowdown model
                scalar = 0.0018;
                break;
                
            case powerUpTypes.PLAYER_SPEEDUP:
                modelPath = './lightning.glb'; // Path to player speedup model
                scalar = 2;
                break;
            case powerUpTypes.HEALTH_BOOST:
                modelPath = '/medicines.glb'; // Path to health boost model
                scalar = 0.05;
                break;
            default:
                console.error('Unknown power-up type');
                return;
        }

        // Load the 3D model using GLTFLoader
        loader.load(modelPath, (gltf) => {
            this.mesh = gltf.scene;
            this.mesh.traverse((child) => {
                if (child.isMesh) {
                    child.material = child.material.clone(); // Clone the original material to preserve it
                }
            });
        
            // Add the original mesh to the scene (with base colors/textures)
            this.mesh.position.copy(this.position);
            this.mesh.scale.setScalar(scalar);
            this.scene.add(this.mesh);
        
            // Create the glow effect on top of the original model
            const glowMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffff,    // Yellow glow or change per power-up type
                transparent: true,
                opacity: 0.9,       // Adjust opacity for glowing effect
            });
        
            // Create a duplicate mesh for the glow
            const glowMesh = new THREE.Mesh(this.mesh.geometry.clone(), glowMaterial);
            glowMesh.scale.multiplyScalar(1.05);  // Slightly larger than original mesh for glow effect
        
            this.scene.add(this.mesh);
        }, undefined, (error) => {
            console.error('An error occurred while loading the model:', error);
        });
    }


    // Collect the power-up
    

    // Function to apply power-up effects
applyPowerUpEffect(type) {
    switch (type) {
        case powerUpTypes.ZOMBIE_SLOWDOWN:
            zombieSpeed *= 0.5; // Slow down zombies
            console.log('Zombies slowed down!');
            break;
        case powerUpTypes.PLAYER_SPEEDUP:
            moveSpeed *= 1.5; // Speed up player
            console.log('Player speed increased!');
            break;
        case powerUpTypes.HEALTH_BOOST:
            playerLife = Math.min(playerLife + 1, 5); // Heal player, max life is 5
            console.log('Player health boosted!');
            updateLifeBar()
            break;
        default:
            break;
    }
}

collect() {
    this.isActive = false;
    this.scene.remove(this.mesh); // Remove the mesh from the scene
    this.applyPowerUpEffect(this.type); // Apply the power-up effect
}

}




// Set up the scene, camera, and renderer

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight , 0.1, 1000);
camera.position.set(0, 5, 0);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // Enable shadows
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Use soft shadows
document.body.appendChild(renderer.domElement);
let zombieSpeed = 10; // Speed at which the zombie runs
let minimumDistance = 1.5; // Distance at which the zombie stops running and can punch
const width=800;
const length = 800;
const zombies = [];
const obstacles = [];
const loader = new FBXLoader(loadingManager); 
const loadPowerUp = new GLTFLoader(loadingManager); 

const controls = new PointerLockControls(camera, document.body);

const MalescreamSound = new Audio('scream.mp3'); // Replace with your audio file path
MalescreamSound.volume = 0.5; // Set volume to 70%

const forestSound = new Audio('forest.mp3'); // Replace with your audio file path
forestSound.loop = true; // Loop the sound for continuous play
forestSound.volume = 0.4; // Set volume to 70%


// Function to start playing the background sound
function startBackgroundSound() {
    forestSound.play().catch(error => {
        console.error("Error playing forest sound:", error);
    });
}


scene.add(controls.object);

// Initialize Cannon.js physics world
let world = new CANNON.World();
world.gravity.set(0, -9.8, 0);
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 10;

const bodyMeshMap = new Map();

// Create a player body
const characterShape = new CANNON.Sphere(0.5); // Example shape
const characterBody = new CANNON.Body({ mass: 1 });
characterBody.position.set(10, 10, 0.5);
characterBody.addShape(characterShape);
world.addBody(characterBody);

characterBody.addEventListener('collide', (event) => {
    const contact = event.contact;
    const otherBody = event.body; // The other body involved in the collision
    if(otherBody !== worldTerrain)
    {
        console.log('Player collided with:', otherBody);
    console.log('Contact point:', contact.ri);
    console.log('Contact normal:', contact.ni);
    }
});

//MINIMAP SECTION
const minimapCanvas = document.createElement('canvas');
minimapCanvas.width = 200;
minimapCanvas.height = 200;
minimapCanvas.style.position = 'absolute';
minimapCanvas.style.bottom = '10px';
minimapCanvas.style.left = '10px';
minimapCanvas.style.border = '2px solid white';
document.body.appendChild(minimapCanvas);
const minimapContext = minimapCanvas.getContext('2d');

// Function to convert 3D world coordinates to 2D minimap coordinates
function worldToMinimap(x, z) {
  const minimapX = ((x + width / 2) / width) * minimapCanvas.width;
  const minimapZ = ((z + length / 2) / length) * minimapCanvas.height;
  return { x: minimapX, y: minimapZ };
}

// Function to update the minimap
function updateMinimap() {
  // Clear the minimap
  minimapContext.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);

  // Draw the terrain outline
  minimapContext.beginPath();
  minimapContext.moveTo(-width / 2, -length / 2);
  minimapContext.lineTo(-width / 2, length / 2);
  minimapContext.lineTo(width / 2, length / 2);
  minimapContext.lineTo(width / 2, -length / 2);
  minimapContext.closePath();
  minimapContext.strokeStyle = 'white';
  minimapContext.stroke();

  // Draw the structures
  minimapContext.fillStyle = 'grey';
  obstacles.forEach(obstacle => {
    const { x, y } = worldToMinimap(
      obstacle.boundingBox.min.x,
      obstacle.boundingBox.min.z
    );
    const width = worldToMinimap(
      obstacle.boundingBox.max.x,
      obstacle.boundingBox.min.z
    ).x - x;
    const height = worldToMinimap(
      obstacle.boundingBox.min.x,
      obstacle.boundingBox.max.z
    ).y - y;
    minimapContext.fillRect(x, y, width, height);
  });

  // Draw the player marker
  const { x, y } = worldToMinimap(
    controls.object.position.x,
    controls.object.position.z
  );
  minimapContext.save();
  minimapContext.translate(x, y);
  minimapContext.rotate(-controls.object.rotation.y);
  minimapContext.beginPath();
  minimapContext.moveTo(0, 0);
  minimapContext.lineTo(10 * Math.cos(Math.PI / 4), 10 * Math.sin(Math.PI / 4));
  minimapContext.lineTo(10 * Math.cos(3 * Math.PI / 4), 10 * Math.sin(3 * Math.PI / 4));
  minimapContext.closePath();
  minimapContext.fillStyle = 'red';
  minimapContext.fill();
  minimapContext.restore();
}

//Life BAR
const lifeBarContainer = document.createElement('div');
lifeBarContainer.style.position = 'absolute';
lifeBarContainer.style.top = '20px';
lifeBarContainer.style.right = '20px';
lifeBarContainer.style.width = '110px'; // Container size slightly bigger than life bar
lifeBarContainer.style.height = '25px';
lifeBarContainer.style.backgroundColor = 'black'; // Retro black background
lifeBarContainer.style.border = '3px solid #888'; // Gray border for retro style
lifeBarContainer.style.boxShadow = '0 0 10px #000'; // Retro glowing effect

const lifeBar = document.createElement('div');
lifeBar.style.width = '100%'; // Full life bar starts at 100%
lifeBar.style.height = '100%';
lifeBar.style.backgroundColor = 'green'; // Healthy color
lifeBar.style.imageRendering = 'pixelated'; // Adds a pixelated effect for retro games
lifeBar.style.transition = 'width 0.3s'; // Smooth transition when life changes

lifeBarContainer.appendChild(lifeBar);
document.body.appendChild(lifeBarContainer);

//kill meter & level displayer
const killCount = document.createElement('div');
killCount.style.position = 'absolute';
killCount.style.top = '50px'; // Positioned below the life bar
killCount.style.right = '20px';
killCount.style.width = '110px';
killCount.style.height = '60px';
killCount.style.color = 'yellow'; // Flashy retro color
killCount.style.fontFamily = "'Press Start 2P', sans-serif"; // Blocky pixel font
killCount.style.fontSize = '18px';
killCount.style.textAlign = 'center';
killCount.style.backgroundColor = 'black';
killCount.style.border = '3px solid #888';
killCount.style.boxShadow = '0 0 10px #000';
killCount.style.padding = '5px';
killCount.style.imageRendering = 'pixelated'; // Retro pixelated effect
killCount.innerHTML = `Kills: 0<br>Level: 1`; // Initial kill count

document.body.appendChild(killCount);

function updateKillCount() {
    kills++;
    killCount.innerHTML = `Kills: ${kills}<br style="display:none;>Level: ${currentLevel}`;

}

function updateLevel(){
    currentLevel++
    killCount.innerHTML = `Kills: ${kills}<br style="display:none;>Level: ${currentLevel}`;

}

// Update life bar based on player's current life
function updateLifeBar() {
    const lifePercentage = (playerLife / 5) * 100; // Convert to percentage
    lifeBar.style.width = `${lifePercentage}%`; // Adjust based on life percentage

    if (lifePercentage <= 50) {
        lifeBar.style.backgroundColor = 'yellow'; // Change color when life is low
        
        MalescreamSound.pause();
        MalescreamSound.currentTime = 0;
        
    }
    if (lifePercentage <= 30) {
        lifeBar.style.backgroundColor = 'red'; // Critical life level
        MalescreamSound.play().catch(error => {
            console.error("Error playing scream sound:", error);
        });
        
    }
}

//game over screen

function createGameOverScreen() {
    gameOverScreen = document.createElement('div');
    gameOverScreen.style.position = 'absolute';
    gameOverScreen.style.top = '50%';
    gameOverScreen.style.left = '50%';
    gameOverScreen.style.transform = 'translate(-50%, -50%)';
    gameOverScreen.style.textAlign = 'center';
    gameOverScreen.style.color = 'orange';
    gameOverScreen.style.fontFamily = "'Press Start 2P', cursive";
    gameOverScreen.style.fontSize = '24px';
    gameOverScreen.style.display = 'none';
    gameOverScreen.innerHTML = `
        <h1 style="color: orange;">GAME OVER</h1>
        <p>PLAY AGAIN?</p>
        <button id="yes-btn" style="margin: 10px; padding: 5px 10px; font-family: inherit; font-size: 18px;">YES</button>
        <button id="no-btn" style="margin: 10px; padding: 5px 10px; font-family: inherit; font-size: 18px;">NO</button>
    `;
    document.body.appendChild(gameOverScreen);

    document.getElementById('yes-btn').addEventListener('click', restartGame);
    document.getElementById('no-btn').addEventListener('click', () => {
        // Do nothing when 'NO' is clicked, game remains in "Game Over" state
    });
}

// Call this function to initialize the game over screen
createGameOverScreen();


function checkGameOver() {
    if (playerLife <= 0 && !isGameOver) {
        isGameOver = true;
        playerLife = 0;
        updateLifeBar();
        showGameOverScreen();

        forestSound.pause();
        forestSound.currentTime = 0;
    }
}

function showGameOverScreen() {
    controls.unlock();
    gameOverScreen.style.display = 'block';
}

function restartGame() {
    
        window.location.reload();
  
}





addSun();
addMoon();
addSky();
addClouds();
addStars();
createTerrain();   
       
        
const createZombie = (skin, position) => {
    loader.load(skin, (fbx) => {
        fbx.scale.setScalar(0.04);
        fbx.position.copy(position);
        fbx.name = 'Zombie';
        scene.add(fbx);

        const mixer = new THREE.AnimationMixer(fbx);
        const zombieData = { fbx, mixer, actionChosen: false, chosenAction: null, isDead: false, life: 10, body: null };

        // Create a physics body for the zombie
        const zombieShape = new CANNON.Box(new CANNON.Vec3(1, 2, 1)); // Adjust size as needed
        const zombieBody = new CANNON.Body({ mass: 1 });
        zombieBody.addShape(zombieShape);
        zombieBody.position.copy(position);
        world.addBody(zombieBody);
        zombieData.body = zombieBody;

        // Load animations
        loader.load('/Running.fbx', (fb) => {
            zombieData.runAction = mixer.clipAction(fb.animations[0]);
            zombieData.runAction.play();
        });
        loader.load('/Zombie_Punching.fbx', (fb) => {
            zombieData.punchAction = mixer.clipAction(fb.animations[0]);
        });
        loader.load('/zombie_biting.fbx', (fb) => {
            zombieData.biteAction = mixer.clipAction(fb.animations[0]);
        });
        loader.load('/zombie_biting_neck.fbx', (fb) => {
            zombieData.biteNeckAction = mixer.clipAction(fb.animations[0]);
        });
        loader.load('/Zombie_Dying.fbx', (fb) => {
            zombieData.Dying1 = mixer.clipAction(fb.animations[0]);
            zombieData.Dying1.loop = THREE.LoopOnce; // Set loop mode to LoopOnce
            zombieData.Dying1.clampWhenFinished = true; // Ensure the animation doesn't reset
        });
        loader.load('/Zombie_Death.fbx', (fb) => {
            zombieData.Dying2 = mixer.clipAction(fb.animations[0]);
            zombieData.Dying2.loop = THREE.LoopOnce; // Set loop mode to LoopOnce
            zombieData.Dying2.clampWhenFinished = true; // Ensure the animation doesn't reset
        });
        zombies.push(zombieData);

        fbx.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // Add boundary checks and synchronization in the update loop
        const updateZombie = (delta) => {
            if (zombieData.mixer) zombieData.mixer.update(delta);

            // Sync the position of the Three.js mesh with the Cannon.js physics body
            fbx.position.copy(zombieBody.position);
            fbx.quaternion.copy(zombieBody.quaternion);

            // Ensure zombies stay within the world bounds
            const minX = -300, maxX = 300;
            const minY = 0, maxY = 10; // Keeping Y as 1 for ground level
            const minZ = -300, maxZ = 300;

            if (zombieBody.position.x < minX) zombieBody.position.x = minX;
            if (zombieBody.position.x > maxX) zombieBody.position.x = maxX;
            if (zombieBody.position.y < minY) zombieBody.position.y = minY;
            if (zombieBody.position.y > maxY) zombieBody.position.y = maxY;
            if (zombieBody.position.z < minZ) zombieBody.position.z = minZ;
            if (zombieBody.position.z > maxZ) zombieBody.position.z = maxZ;

            // Sync the position of the Three.js mesh with the adjusted Cannon.js physics body
            fbx.position.copy(zombieBody.position);
        };

        // Add the update function to the zombies array for continuous updates
        zombieData.update = updateZombie;
    });
};

class Zombie {
    constructor(loader, scene, zombies, world) {
        this.position = this.getRandomPosition(); // Randomly choose position
        this.loader = loader;
        this.scene = scene;
        this.zombies = zombies;
        this.world = world;
        this.fbx = null;
        this.mixer = null;
        this.isDead = false;
        this.life = 10; // Initial life
        this.actionChosen = false;
        this.chosenAction = null;
        this.activeAction = null;
        this.animations = {}; // Store the loaded animations
        this.collisionDistance = 10; // Minimum distance between zombies to avoid collision
        this.body = null; // Physics body

        // List of available zombie models (textures)
        this.availableSkins = [
            '/Warzombie.fbx',
            '/YakuZombie.fbx',
            '/Zombiegirl.fbx'
        ];

        // Choose a random skin from availableSkins
        this.skin = this.getRandomSkin();

        // Load the zombie model and animations
        this.loadModel();
    }

    // Method to randomly select a skin from availableSkins
    getRandomSkin() {
        const randomIndex = Math.floor(Math.random() * this.availableSkins.length);
        return this.availableSkins[randomIndex];
    }

    // Method to randomly choose a position within a certain range
    getRandomPosition() {
        const minX = -300, maxX = 300;
        const minY = 1, maxY = 1; // Keeping Y as 1 for ground level
        const minZ = -300, maxZ = 300;

        const randomX = Math.random() * (maxX - minX) + minX;
        const randomY = Math.random() * (maxY - minY) + minY;
        const randomZ = Math.random() * (maxZ - minZ) + minZ;

        return new THREE.Vector3(randomX, randomY, randomZ);
    }

    loadModel() {
        this.loader.load(this.skin, (fbx) => {
            fbx.scale.setScalar(0.03);
            fbx.position.copy(this.position);
            fbx.name = 'Zombie';
            this.scene.add(fbx);
            this.fbx = fbx;

            this.mixer = new THREE.AnimationMixer(fbx);

            // Load animations
            this.loadAnimations();

            this.zombies.push(this);

            fbx.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // Create physics body for the zombie
            this.createPhysicsBody();

            console.log('Zombie added to the scene:', this.fbx);
        }, undefined, (error) => {
            console.error('Error loading zombie model:', error);
        });
    }

    loadAnimations() {
        // Load run animation
        this.loader.load('/Running.fbx', (fb) => {
            this.animations.runAction = this.mixer.clipAction(fb.animations[0]);
            this.animations.runAction.play();
        });
        // Load punch action
        this.loader.load('/Zombie_Punching.fbx', (fb) => {
            this.animations.punchAction = this.mixer.clipAction(fb.animations[0]);
        });
        this.loader.load('/zombie_idle.fbx', (fb) => {
            this.animations.idleAction = this.mixer.clipAction(fb.animations[0]);
        });
        // Load bite neck action
        this.loader.load('/zombie_biting_neck.fbx', (fb) => {
            this.animations.biteNeckAction = this.mixer.clipAction(fb.animations[0]);
        });
        // Load dying animation 1
        this.loader.load('/Zombie_Dying.fbx', (fb) => {
            this.animations.Dying1 = this.mixer.clipAction(fb.animations[0]);
            this.animations.Dying1.loop = THREE.LoopOnce; // Play once
            this.animations.Dying1.clampWhenFinished = true; // Stop resetting
        });
        // Load dying animation 2
        this.loader.load('/Zombie_Death.fbx', (fb) => {
            this.animations.Dying2 = this.mixer.clipAction(fb.animations[0]);
            this.animations.Dying2.loop = THREE.LoopOnce;
            this.animations.Dying2.clampWhenFinished = true;
        });
    }

    // Create physics body for the zombie
    createPhysicsBody() {
        const shape = new CANNON.Box(new CANNON.Vec3(0.5, 1, 0.5)); // Adjust size as needed
        this.body = new CANNON.Body({ mass: 1 });
        this.body.addShape(shape);
        this.body.position.copy(this.position);
        this.body.userData = { type: 'zombie' }; // Add user data for collision detection
        this.world.addBody(this.body);
    }

    // Check collision with other zombies and avoid them
    avoidCollisionWithOtherZombies() {
        this.zombies.forEach(zombie => {
            if (zombie !== this && !zombie.isDead) {
                const distance = this.fbx.position.distanceTo(zombie.fbx.position);
                if (distance < this.collisionDistance) {
                    // Adjust direction to avoid the collision
                    const directionAway = new THREE.Vector3().subVectors(this.fbx.position, zombie.fbx.position).normalize();
                    this.fbx.position.add(directionAway.multiplyScalar(1)); // Move 1 unit away
                    this.body.position.copy(this.fbx.position); // Sync physics body with Three.js mesh
                }
            }
        });
    }

    update(delta, controls) {
        if (this.mixer) this.mixer.update(delta);

        const zombiePosition = new THREE.Vector3();
        const cameraPosition = new THREE.Vector3(controls.object.position.x, 0, controls.object.position.z);
        this.fbx.getWorldPosition(zombiePosition);

        const direction = new THREE.Vector3().subVectors(cameraPosition, zombiePosition).normalize();
        this.fbx.lookAt(cameraPosition);

        const distanceToCamera = zombiePosition.distanceTo(cameraPosition);

        // Avoid collision with other zombies
        this.avoidCollisionWithOtherZombies();

        // 1. If far from the camera (> 100), play idle action
        if (distanceToCamera > 20) {
            if (this.animations.idleAction) {
                this.switchAction(this.animations.idleAction);
            }
        } 
        // 2. If close to the camera (within minimumDistance), attack
        else if (distanceToCamera <= minimumDistance) {
            const attackActions = [this.animations.punchAction, this.animations.biteAction, this.animations.biteNeckAction];
            if (!this.actionChosen) {
                this.chosenAction = this.getRandomAction(attackActions);
                this.actionChosen = true;
            }

            if (this.chosenAction) {
                this.switchAction(this.chosenAction);
            }
        } 
        // 3. If in between (between minimumDistance and 100), move towards the camera and run
        else {
            this.actionChosen = false; // Reset chosen action
            this.fbx.position.add(direction.multiplyScalar(zombieSpeed * delta)); // Move zombie
            this.body.position.copy(this.fbx.position); // Sync physics body with Three.js mesh

            // Play running animation
            if (this.animations.runAction) {
                this.animations.runAction.timeScale = zombieSpeed / 16;
                this.switchAction(this.animations.runAction);
            }
        }

        // Ensure zombies stay within the world bounds
        this.checkBounds();
    }

    // Ensure zombies stay within the world bounds
    checkBounds() {
        const minX = -300, maxX = 300;
        const minY = 1, maxY = 1; // Keeping Y as 1 for ground level
        const minZ = -300, maxZ = 300;

        if (this.fbx.position.x < minX) this.fbx.position.x = minX;
        if (this.fbx.position.x > maxX) this.fbx.position.x = maxX;
        if (this.fbx.position.y < minY) this.fbx.position.y = minY;
        if (this.fbx.position.y > maxY) this.fbx.position.y = maxY;
        if (this.fbx.position.z < minZ) this.fbx.position.z = minZ;
        if (this.fbx.position.z > maxZ) this.fbx.position.z = maxZ;

        this.body.position.copy(this.fbx.position); // Sync physics body with Three.js mesh
    }

    getRandomAction(actions) {
        actions = actions.filter(action => action); // Filter out undefined actions
        const randomIndex = Math.floor(Math.random() * actions.length);
        return actions[randomIndex];
    }

    switchAction(toAction) {
        if (this.activeAction !== toAction) {
            if (this.activeAction) this.activeAction.fadeOut(0.5); // Smooth transition
            toAction.reset().fadeIn(0.5).play(); // Play the new animation
            this.activeAction = toAction; // Update active action
        }
    }
}

// Instantiate zombies
function createZombies(loader, scene, zombies, world) {
    for (let i = 0; i < 15; i++) {
        new Zombie(loader, scene, zombies, world);
    }
}

// Create different zombies using the Zombie class
//createZombies(loader, scene, zombies, world);
    

function createWall(terrainGeometry) {
    const textureLoader = new THREE.TextureLoader();

    // Load wall bump map
    const wallBumpMap = textureLoader.load('wallbumpmap.jpg');

    // Configure the bump map so it doesn't tile too many times
    wallBumpMap.wrapS = wallBumpMap.wrapT = THREE.RepeatWrapping;
    wallBumpMap.repeat.set(1, 1); // Adjust this value to maintain the original aspect ratio

    // Helper function to get terrain height at specific coordinates
    function getTerrainHeight(x, z, terrainGeometry, terrainWidth, terrainLength, resolution) {
        const vertices = terrainGeometry.attributes.position.array;

        // Convert x, z into the corresponding index on the heightmap grid
        const xIndex = Math.floor((x + terrainWidth / 2) / terrainWidth * (resolution - 1));
        const zIndex = Math.floor((z + terrainLength / 2) / terrainLength * (resolution - 1));

        // Find the corresponding vertex in the geometry
        const vertexIndex = (zIndex * resolution + xIndex) * 3; // Each vertex has 3 components (x, y, z)
        const terrainHeight = vertices[vertexIndex + 2]; // The height is the Z component in the plane geometry

        return terrainHeight;
    }

    // Define the geometry and material for the walls
    const wallGeometry = new THREE.BoxGeometry(width, 30, 1);

    // Use MeshPhongMaterial to support bump mapping
    const wallMaterial = new THREE.MeshPhongMaterial({
        color: 0x8B4513,  // A brown color for the walls
        bumpMap: wallBumpMap,
        bumpScale: 0.5,   // Adjust this value to control the intensity of the bump effect
        shininess: 10     // Adjust for desired shininess
    });

    // Function to create a wall and add it to the scene and physics world
    function createWallMeshAndBody(position, rotation = 0, width, height, depth) {
        const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMaterial);
        wallMesh.position.copy(position);
        wallMesh.rotation.y = rotation;
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        scene.add(wallMesh);

        const wallShape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2)); // Adjust size as needed
        const wallBody = new CANNON.Body({ mass: 0 }); // Static body
        wallBody.addShape(wallShape);
        wallBody.position.copy(position);
        wallBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotation);
        world.addBody(wallBody);

        // Map the body to the mesh
        bodyMeshMap.set(wallBody, wallMesh);
    }

    // Create front wall
    const frontWallHeight = getTerrainHeight(0, -width / 2, terrainGeometry, width, length, 128); // Adjust based on resolution
    createWallMeshAndBody(new THREE.Vector3(0, frontWallHeight + 10 - 1, -width / 2), 0, width, 30, 1);

    // Create back wall
    const backWallHeight = getTerrainHeight(0, width / 2, terrainGeometry, width, length, 128);
    createWallMeshAndBody(new THREE.Vector3(0, backWallHeight + 10 - 1, width / 2), 0, width, 30, 1);

    // Create left wall
    const leftWallHeight = getTerrainHeight(-width / 2, 0, terrainGeometry, width, length, 128);
    createWallMeshAndBody(new THREE.Vector3(-width / 2, leftWallHeight + 10 - 1, 0), Math.PI / 2, length, 30, 1);

    // Create right wall
    const rightWallHeight = getTerrainHeight(width / 2, 0, terrainGeometry, width, length, 128);
    createWallMeshAndBody(new THREE.Vector3(width / 2, rightWallHeight + 10 - 1, 0), Math.PI / 2, length, 30, 1);
}

let worldTerrain;
function createTerrain() {
    const terrainWidth = width;
    const terrainLength = length;
    const resolution = 128; // This should match your heightmap image resolution

    // Load the heightmap and ground texture
    const loader = new THREE.TextureLoader();
    
    // Load the heightmap
    loader.load('terrain.jfif', (heightmapTexture) => {
        // Load the ground texture
        loader.load('ground.jpg', (groundTexture) => {
            // Repeat the texture over the terrain
            groundTexture.wrapS = groundTexture.wrapT = THREE.ClampToEdgeWrapping;
            
            // Ensure the texture covers the entire plane by adjusting UV coordinates (not tiling)
            groundTexture.repeat.set(1, 1);

            // Create a canvas to read heightmap pixel data
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = resolution;
            canvas.height = resolution;
            context.drawImage(heightmapTexture.image, 0, 0);
            const imageData = context.getImageData(0, 0, resolution, resolution);

            // Create the geometry
            terrainGeometry = new THREE.PlaneGeometry(
                terrainWidth,
                terrainLength,
                resolution - 1,
                resolution - 1
            );

            // Deform the geometry based on the heightmap
            const vertices = terrainGeometry.attributes.position.array;
            for (let i = 0, j = 0, l = vertices.length; i < l; i++, j += 3) {
                const heightValue = imageData.data[i * 4]; // Assuming grayscale image, use only the red channel
                vertices[j + 2] = 0; // Adjust the division factor to control the terrain height
            }

            // Update normals to account for the new vertex positions
            terrainGeometry.computeVertexNormals();

            // Create the material for the terrain using the ground texture
            const terrainMaterial = new THREE.MeshLambertMaterial({
                map: groundTexture,  // Apply the ground texture
                wireframe: false     // Set to true if you want to see the mesh structure
            });

            // Create the terrain mesh
            const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
            terrain.rotation.x = -Math.PI / 2; // Rotate to lay flat
            terrain.receiveShadow = true;      // Allow the terrain to receive shadows

            // Add the terrain to the scene
            scene.add(terrain);

            // Extract vertices and indices from the terrain geometry
            const cannonVertices = [];
            const cannonIndices = [];
            for (let i = 0; i < vertices.length; i += 3) {
                cannonVertices.push(vertices[i], vertices[i + 1], vertices[i + 2]);
            }
            for (let i = 0; i < terrainGeometry.index.array.length; i += 3) {
                cannonIndices.push(
                    terrainGeometry.index.array[i],
                    terrainGeometry.index.array[i + 1],
                    terrainGeometry.index.array[i + 2]
                );
            }

            // Create the Trimesh shape for Cannon.js
            const terrainShape = new CANNON.Trimesh(cannonVertices, cannonIndices);

            // Create the terrain body for Cannon.js
            const terrainBody = new CANNON.Body({ mass: 0 }); // Mass = 0 for static ground
            terrainBody.addShape(terrainShape);
            
            // Set the position and rotation to match the Three.js terrain
            terrainBody.position.set(0, 0, 0);
            terrainBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);

            // Add the terrain body to the world
            world.addBody(terrainBody);
            worldTerrain = terrainBody;
            // Optionally, create walls around the terrain
            createWall(terrainGeometry);
            addStructures();
        });
    });
}

function getTerrainHeight(x, z, terrainGeometry, terrainWidth, terrainLength, resolution) {
    const vertices = terrainGeometry.attributes.position.array;

    // Convert x, z into the corresponding index on the heightmap grid
    const xIndex = Math.floor((x + terrainWidth / 2) / terrainWidth * (resolution - 1));
    const zIndex = Math.floor((z + terrainLength / 2) / terrainLength * (resolution - 1));

    // Find the corresponding vertex in the geometry
    const vertexIndex = (zIndex * resolution + xIndex) * 3; // Each vertex has 3 components (x, y, z)
    const terrainHeight = vertices[vertexIndex + 2]; // The height is the Z component in the plane geometry

    return terrainHeight;
}


    function addSun() {
        sun = new THREE.DirectionalLight(0xe6f0c5, 1);
        sun.position.set(0, 1000, 0); // Move sun high up
        sun.castShadow = true;

        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 1500;
        sun.shadow.camera.left = -500;
        sun.shadow.camera.right = 500;
        sun.shadow.camera.top = 500;
        sun.shadow.camera.bottom = -500;

        scene.add(sun);

        // Create a sky sphere
        const skyGeometry = new THREE.SphereGeometry(900, 32, 32);
        daySkyMaterial = new THREE.MeshBasicMaterial({ color: 0x87CEEB, side: THREE.BackSide });
        const sky = new THREE.Mesh(skyGeometry, daySkyMaterial);
        scene.add(sky);

        // Create sun sphere (visual representation)
        const sunGeometry = new THREE.SphereGeometry(40, 32, 32);
        const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
        sunMesh.position.set(0, 1000, 0); // Position sun in the sky sphere
        sky.add(sunMesh); // Add sun to the sky
    }

    function animateSun() {
            const time = Date.now() * 0.001;
            const radius = 700;
            sunMesh.position.x = Math.cos(time * 0.1) * radius;
            sunMesh.position.y = Math.sin(time * 0.1) * radius;

            // Update directional light position
            sun.position.copy(sunMesh.position);
            sun.position.multiplyScalar(1000 / radius);

          
        }

    function addMoon() {
        moon = new THREE.DirectionalLight(0xffffff, 0.5); // Dimmer than the sun
        moon.position.set(0, 1000, 0); // Position it high up, same as the sun
        moon.castShadow = true; // Moonlight usually does not cast shadows

        moon.shadow.mapSize.width = 2048;
        moon.shadow.mapSize.height = 2048;
        moon.shadow.camera.near = 0.5;
        moon.shadow.camera.far = 1500;
        moon.shadow.camera.left = -500;
        moon.shadow.camera.right = 500;
        moon.shadow.camera.top = 500;
        moon.shadow.camera.bottom = -500;
        moon.shadow.bias = -0.0155; 

        scene.add(moon);

        // Create a sky sphere
        const skyGeometry = new THREE.SphereGeometry(900, 32, 32);
       nightSkyMaterial = new THREE.MeshBasicMaterial({ color: 0x391f8f, side: THREE.BackSide });
        const sky = new THREE.Mesh(skyGeometry, nightSkyMaterial);
        scene.add(sky);

        const textureLoader = new THREE.TextureLoader();
    textureLoader.load('moon.jpg', function(texture) {
        // Create moon sphere (visual representation) with the texture
        const moonGeometry = new THREE.SphereGeometry(40, 32, 32);
        const moonMaterial = new THREE.MeshBasicMaterial({ map: texture }); // Use moon texture

        moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
        moonMesh.position.set(0, 1000, 0); // Position moon in the sky sphere
        scene.add(moonMesh); // Add moon to the scene
    });
        
    }

    function animateMoon() {
        const time = Date.now() * 0.001;
        const radius = 700;
        moonMesh.position.x = Math.cos(time * 0.1 + Math.PI) * radius; // Moon follows opposite direction of sun
        moonMesh.position.y = Math.sin(time * 0.1 + Math.PI) * radius;

        // Update moon directional light position
        moon.position.copy(moonMesh.position);
        moon.position.multiplyScalar(1000 / radius);

        // Update sky color
        
    }

    function addSky() {
      const skyGeometry = new THREE.SphereGeometry(900, 32, 32);
      const skyMaterial = new THREE.MeshBasicMaterial({ color: 0x87CEEB, side: THREE.BackSide });
      sky = new THREE.Mesh(skyGeometry, skyMaterial);
      scene.add(sky);
    }

    function addClouds() {
      clouds = new THREE.Group();
      const cloudGeometry = new THREE.SphereGeometry(5, 8, 8);
      const cloudMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.8 });

      for (let i = 0; i < 100; i++) {
        const cloudPart = new THREE.Mesh(cloudGeometry, cloudMaterial);
        cloudPart.position.set(
          Math.random() * 800 - 400,
          Math.random() * 100 + 200,
          Math.random() * 800 - 400
        );
        cloudPart.scale.set(Math.random() * 2 + 1, Math.random() * 2 + 1, Math.random() * 2 + 1);
        clouds.add(cloudPart);
      }
      scene.add(clouds);
    }

    function addStars() {
      stars = new THREE.Group();
      const starGeometry = new THREE.SphereGeometry(0.7, 8, 8);
      const starMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });

      for (let i = 0; i < 1000; i++) {
        const star = new THREE.Mesh(starGeometry, starMaterial);
        star.position.set(
          Math.random() * 1800 - 300,
          Math.random() * 1800 - 300,
          Math.random() * 1800 - 300
        );
        stars.add(star);
      }
      scene.add(stars);
    }

    function updateSkyColor() {
      const dayColor = new THREE.Color(0x87CEEB); // Blue sky
      const nightColor = new THREE.Color(0x192841); // Dark night sky
      const sunsetColor = new THREE.Color(0xFFA500); // Orange for sunset

      let t = (sunMesh.position.y + 700) / 1400; // Normalize sun position to [0, 1]
      t = Math.max(0, Math.min(1, t)); // Clamp to [0, 1]

      let skyColor;
      if (t > 0.7) {
        skyColor = dayColor;
        clouds.visible = true;
        stars.visible = false;
      } else if (t > 0.4) {
        skyColor = dayColor.lerp(sunsetColor, (t - 0.4) * (1 / 0.3));
        clouds.visible = true;
        stars.visible = false;
      } else if (t > 0.2) {
        skyColor = sunsetColor.lerp(nightColor, (t - 0.2) * (1 / 0.2));
        clouds.visible = false;
        stars.visible = true;
      } else {
        skyColor = nightColor;
        clouds.visible = false;
        stars.visible = true;
      }

      sky.material.color.copy(skyColor);

      // Adjust cloud opacity based on time of day
      if (clouds.visible) {
        const cloudOpacity = Math.min(1, Math.max(0, (t - 0.4) * 2));
        clouds.children.forEach(cloud => {
          cloud.material.opacity = cloudOpacity * 0.8;
        });
      }

      // Adjust star brightness based on time of day
      if (stars.visible) {
        const starBrightness = Math.min(1, Math.max(0, (0.4 - t) * 2));
        stars.children.forEach(star => {
          star.material.opacity = starBrightness;
        });
      }
    }



function addTrees() {
    const treeCount = width*0.025; // Number of trees
    const textureLoader = new THREE.TextureLoader();
    
    // Load the bump map texture
    const barkBumpMap = textureLoader.load('treebark.jpg'); // Replace with the path to your texture
    const leafTexture = textureLoader.load('leaves.avif'); // Replace with the path to your leaf texture


    for (let i = 0; i < treeCount; i++) {
        const x = Math.random() * width - width / 2; // Randomize x position
        const z = Math.random() * width - width / 2; // Randomize z position

        // Randomize tree sizes
        const trunkHeight = 25 + Math.random() * 20;
        const trunkRadius = 2.5 + Math.random() * 3.5;

        // Create the tree trunk with bump map
        const trunkGeometry = new THREE.CylinderGeometry(trunkRadius, trunkRadius * 1.2, trunkHeight);
        const trunkMaterial = new THREE.MeshPhongMaterial({
            color: 0x8B4513,
            bumpMap: barkBumpMap,
            bumpScale: 0.7
        });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.set(x, trunkHeight / 2, z);
        
        trunk.castShadow = true;
        trunk.receiveShadow = true;

        // Create low-poly tree leaves
        const leavesGroup = new THREE.Group();
        const leavesMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x228B22,
            flatShading: true, // This gives the polygon look
            map: leafTexture,
        });

        // Create multiple geometric shapes for leaves
        for (let j = 0; j < 5; j++) { // Adjust number of leaf clusters
            const leafGeometry = new THREE.IcosahedronGeometry(10 + Math.random() * 5, 0); // Low poly sphere
            const leaf = new THREE.Mesh(leafGeometry, leavesMaterial);
            
            // Position leaves
            const angle = (j / 5) * Math.PI * 2;
            const radius = 5 + Math.random() * 3;
            leaf.position.set(
                Math.cos(angle) * radius,
                trunkHeight + 5 + Math.random() * 5,
                Math.sin(angle) * radius
            );
            
            // Random scaling and rotation
            const scale = 0.8 + Math.random() * 0.4;
            leaf.scale.set(scale, scale * 1.2, scale);
            leaf.rotation.set(Math.random() * 0.5, Math.random() * Math.PI * 2, Math.random() * 0.5);
            
            leaf.castShadow = true;
            leaf.receiveShadow = true;
            
            leavesGroup.add(leaf);
        }

        // Add color variation
        leavesGroup.children.forEach(leaf => {
            leaf.material = leaf.material.clone();
            leaf.material.color.setHSL(
                0.25 + Math.random() * 0.1,
                0.5 + Math.random() * 0.2,
                0.4 + Math.random() * 0.2
            );
        });

        leavesGroup.position.set(x, 0, z);
        scene.add(leavesGroup);
        scene.add(trunk);

        // Create a bounding box for the entire tree
        const treeBoundingBox = new THREE.Box3().setFromObject(trunk);
        //treeBoundingBox.expandByObject(trunk);

        // Add tree as an obstacle (bounding box)
        obstacles.push({ mesh: trunk, boundingBox: treeBoundingBox });

        // Create a physics body for the tree trunk
        const trunkShape = new CANNON.Cylinder(trunkRadius, trunkRadius * 1.2, trunkHeight, 32);
        const trunkBody = new CANNON.Body({ mass: 0 }); // Static body
        trunkBody.addShape(trunkShape);
        trunkBody.position.set(x, trunkHeight / 2, z);
        world.addBody(trunkBody);

        // Map the body to the mesh
        bodyMeshMap.set(trunkBody, trunk);
    }
}

addTrees();
function addZombies(playerPosition) {
    const zombieCount = width * 0.01 * currentLevel; // Adjust based on desired density
    const maxAttempts = zombieCount * 10; // Maximum attempts to find valid positions
    let placedZombies = 0;
    let attempts = 0;

    while (placedZombies < zombieCount && attempts < maxAttempts) {
        attempts++;
        const x = Math.random() * width - width / 2;
        const z = Math.random() * width - width / 2;

        // Calculate the distance from the player to the potential zombie position
        const distanceToPlayer = Math.sqrt(Math.pow(playerPosition.x - x, 2) + Math.pow(playerPosition.z - z, 2));

        // Ensure the zombie is at least 150 units away from the player's position
        if (distanceToPlayer < 50) {
            continue; // Skip this iteration if the zombie is too close to the player
        }

        // Define the dimensions for the zombie bounding box
        const zombieWidth = 2; // Adjust as needed
        const zombieDepth = 2; // Adjust as needed

        // Check if the space is clear for the zombie
        if (!isSpaceClear(x, z, zombieWidth, zombieDepth)) {
            continue; // Skip this iteration if the space is not clear
        }

        // Create the zombie using the createZombie function
        createZombie('/Warzombie.fbx', new THREE.Vector3(x, 1, z));

        // Increment the count of placed zombies
        placedZombies++;
    }

    if (attempts >= maxAttempts) {
        console.log('Max attempts reached, could not place all zombies.');
    }
}

// Ensure that the isSpaceClear function is accessible
function isSpaceClear(x, z, structureWidth, depth) {
    const margin = 1; // Margin for the zombie bounding box
    const checkBox = new THREE.Box3(
        new THREE.Vector3(x - structureWidth / 2 - margin, 0, z - depth / 2 - margin),
        new THREE.Vector3(x + structureWidth / 2 + margin, 100, z + depth / 2 + margin)
    );

    // Check against existing obstacles
    for (let obstacle of obstacles) {
        if (checkBox.intersectsBox(obstacle.boundingBox)) {
            return false; // Space is not clear
        }
    }

    return true; // Space is clear
}

addZombies(controls.object.position);


     

function addStructures() {
   

    const structureCount = width * 0.01;
    const textureLoader = new THREE.TextureLoader();
    // Load texture maps
    const baseColorMap = textureLoader.load('Wall_Stone_010_basecolor.jpg');
    const normalMap = textureLoader.load('Wall_Stone_010_normal.jpg');
    const roughnessMap = textureLoader.load('Wall_Stone_010_roughness.jpg');
    const heightMap = textureLoader.load('Wall_Stone_010_height.png');  // Also known as displacement map
    const aoMap = textureLoader.load('Wall_Stone_010_ambientOcclusion.jpg');

    const brickMaterial = new THREE.MeshStandardMaterial({
        side: THREE.DoubleSide,
        map: baseColorMap,
        normalMap: normalMap,
        roughnessMap: roughnessMap,
        displacementMap: heightMap,
        displacementScale: 0.8,
        aoMap: aoMap,
        roughness: 0.8,
        metalness: 0.8
    });

    // Ensure that openingHeight and openingWidth are defined
    const openingHeight = 25; // Example value, adjust as needed
    const openingWidth = 15;  // Example value, adjust as needed

    function isSpaceClear(x, z, structureWidth, depth) {
        const margin = 5; // Add a small margin around structures
        const checkBox = new THREE.Box3(
            new THREE.Vector3(x - structureWidth / 2 - margin, 0, z - depth / 2 - margin),
            new THREE.Vector3(x + structureWidth / 2 + margin, 100, z + depth / 2 + margin)
        );

        // Check against existing obstacles
        for (let obstacle of obstacles) {
            if (checkBox.intersectsBox(obstacle.boundingBox)) {
                return false;
            }
        }

        return true;
    }

    let placedStructures = 0;
    let attempts = 0;
    const maxAttempts = structureCount * 10;

    // Try placing structures until the desired count or max attempts is reached
    while (placedStructures < structureCount && attempts < maxAttempts) {
        attempts++;
        const x = Math.random() * width - width / 2;
        const z = Math.random() * width - width / 2;

        const structureWidth = 25 + Math.random() * 15;
        const depth = 20 + Math.random() * 15;
        const height = 35 + Math.random() * 15;
        const terrainHeight = getTerrainHeight(x, z, terrainGeometry, width, length, 128);

        if (!isSpaceClear(x, z, structureWidth, depth)) {
            continue;  // Skip this iteration if the space is not clear
        }

        // Create a group to hold all parts of the structure
        const structureGroup = new THREE.Group();

        const powerUpType = Object.values(powerUpTypes)[Math.floor(Math.random() * Object.keys(powerUpTypes).length)];
        const powerUp = new PowerUp(powerUpType, new THREE.Vector3(x, terrainHeight + height * 0.1, z), scene,loadPowerUp);
        powerUps.push(powerUp);
        


        // Create walls with more segments for better displacement
        const wallGeometry = new THREE.BoxGeometry(1, height, depth, 1, 50, 50);

        // Left wall
        const leftWall = new THREE.Mesh(wallGeometry, brickMaterial);
        leftWall.position.set(-structureWidth / 2 + 0.5, height / 2, 0);
        structureGroup.add(leftWall);

        // Right wall
        const rightWall = new THREE.Mesh(wallGeometry, brickMaterial);
        rightWall.position.set(structureWidth / 2 - 0.5, height / 2, 0);
        structureGroup.add(rightWall);

        // Back wall
        const backWallGeometry = new THREE.BoxGeometry(structureWidth, height, 1, 50, 50, 1);
        const backWall = new THREE.Mesh(backWallGeometry, brickMaterial);
        backWall.position.set(0, height / 2, -depth / 2 + 0.5);
        structureGroup.add(backWall);

        // Front wall (with opening)
        const frontWallTopGeometry = new THREE.BoxGeometry(structureWidth, height - openingHeight, 1, 50, 25, 1);
        const frontWallTop = new THREE.Mesh(frontWallTopGeometry, brickMaterial);
        frontWallTop.position.set(0, height / 2 + openingHeight / 2, depth / 2 - 0.5);
        structureGroup.add(frontWallTop);

        const frontWallSideGeometry = new THREE.BoxGeometry((structureWidth - openingWidth) / 2, openingHeight, 1, 25, 25, 1);
        const frontWallLeft = new THREE.Mesh(frontWallSideGeometry, brickMaterial);
        frontWallLeft.position.set(-structureWidth / 4 - openingWidth / 4, openingHeight / 2, depth / 2 - 0.5);
        structureGroup.add(frontWallLeft);

        const frontWallRight = new THREE.Mesh(frontWallSideGeometry, brickMaterial);
        frontWallRight.position.set(structureWidth / 4 + openingWidth / 4, openingHeight / 2, depth / 2 - 0.5);
        structureGroup.add(frontWallRight);

        // Roof
        const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.7, metalness: 0.2 });
        const roofGeometry = new THREE.BoxGeometry(structureWidth, 1, depth);
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.set(0, height - 0.5, 0);
        structureGroup.add(roof);

        // Position the entire structure
        structureGroup.position.set(x, terrainHeight, z);

        // Add shadows
        structureGroup.traverse((object) => {
            if (object instanceof THREE.Mesh) {
                object.castShadow = true;
                object.receiveShadow = true;
            }
        });

        scene.add(structureGroup);

        // Create physics bodies for each wall
        const wallThickness = 10;
        const leftWallShape = new CANNON.Box(new CANNON.Vec3(wallThickness / 2, height / 2, depth / 2));
        const rightWallShape = new CANNON.Box(new CANNON.Vec3(wallThickness / 2, height / 2, depth / 2));
        const backWallShape = new CANNON.Box(new CANNON.Vec3(structureWidth / 2, height / 2, wallThickness / 2));
        const frontWallTopShape = new CANNON.Box(new CANNON.Vec3(structureWidth / 2, (height - openingHeight) / 2, wallThickness / 2));
        const frontWallSideShape = new CANNON.Box(new CANNON.Vec3((structureWidth - openingWidth) / 4, openingHeight / 2, wallThickness / 2));
        const roofShape = new CANNON.Box(new CANNON.Vec3(structureWidth / 2, 0.5, depth / 2));

        const leftWallBody = new CANNON.Body({ mass: 0 });
        leftWallBody.addShape(leftWallShape);
        leftWallBody.position.set(x - structureWidth / 2 + wallThickness / 2, terrainHeight + height / 2, z);
        world.addBody(leftWallBody);

        const rightWallBody = new CANNON.Body({ mass: 0 });
        rightWallBody.addShape(rightWallShape);
        rightWallBody.position.set(x + structureWidth / 2 - wallThickness / 2, terrainHeight + height / 2, z);
        world.addBody(rightWallBody);

        const backWallBody = new CANNON.Body({ mass: 0 });
        backWallBody.addShape(backWallShape);
        backWallBody.position.set(x, terrainHeight + height / 2, z - depth / 2 + wallThickness / 2);
        world.addBody(backWallBody);

        const frontWallTopBody = new CANNON.Body({ mass: 0 });
        frontWallTopBody.addShape(frontWallTopShape);
        frontWallTopBody.position.set(x, terrainHeight + height / 2 + openingHeight / 2, z + depth / 2 - wallThickness / 2);
        world.addBody(frontWallTopBody);

        const frontWallLeftBody = new CANNON.Body({ mass: 0 });
        frontWallLeftBody.addShape(frontWallSideShape);
        frontWallLeftBody.position.set(x - structureWidth / 4 - openingWidth / 4, terrainHeight + openingHeight / 2, z + depth / 2 - wallThickness / 2);
        world.addBody(frontWallLeftBody);

        const frontWallRightBody = new CANNON.Body({ mass: 0 });
        frontWallRightBody.addShape(frontWallSideShape);
        frontWallRightBody.position.set(x + structureWidth / 4 + openingWidth / 4, terrainHeight + openingHeight / 2, z + depth / 2 - wallThickness / 2);
        world.addBody(frontWallRightBody);

        const roofBody = new CANNON.Body({ mass: 0 });
        roofBody.addShape(roofShape);
        roofBody.position.set(x, terrainHeight + height - 0.5, z);
        world.addBody(roofBody);

        // Map the bodies to the meshes
        bodyMeshMap.set(leftWallBody, leftWall);
        bodyMeshMap.set(rightWallBody, rightWall);
        bodyMeshMap.set(backWallBody, backWall);
        bodyMeshMap.set(frontWallTopBody, frontWallTop);
        bodyMeshMap.set(frontWallLeftBody, frontWallLeft);
        bodyMeshMap.set(frontWallRightBody, frontWallRight);
        bodyMeshMap.set(roofBody, roof);

        placedStructures++;
    }

    if (attempts >= maxAttempts) {
        console.log('Max attempts reached, could not place all structures.');
    }
}

function checkPowerUpCollection() {
  
    const player = controls.object.position;

    for (let i = powerUps.length - 1; i >= 0; i--) {
        const powerUp = powerUps[i];
       

        if (player.distanceTo(powerUp.position)<10 && powerUp.isActive) {
            console.log('player speed before:'+moveSpeed + "\n"+ 'zombiespeed before :'+zombieSpeed + "\n"+'player health before:'+playerLife)

            
            powerUp.collect(moveSpeed,zombieSpeed,playerLife); // Collect the power-up
            powerUps.splice(i, 1); // Remove from the active list
            updateLifeBar(); // Update the life bar

            console.log('powerup activated!!:'+powerUp.type)
            console.log('player speed after:'+moveSpeed + "\n"+ 'zombiespeed after:'+zombieSpeed + "\n"+'player health after:'+playerLife)
        }
    }
}



function getRandomAction(zombie, actions) {
    actions = actions.filter(action => action); // Filter out undefined actions
    const randomIndex = Math.floor(Math.random() * actions.length);
    return actions[randomIndex];
}




function switchAction(zombie, toAction) {
    if (zombie.activeAction !== toAction) {
        if (zombie.activeAction) zombie.activeAction.fadeOut(0.5); // Smooth transition between animations
        toAction.reset().fadeIn(0.5).play(); // Play the new animation
        zombie.activeAction = toAction; // Update the active action
    }
}


function avoidObstacles(zombiePosition, directionToPlayer, obstacles, zombieSpeed, delta) {
    const avoidanceForce = new THREE.Vector3();
    const avoidanceStrength = 10; // Increased from 5
    const minimumSeparation = 2; // Minimum distance to keep from obstacles

    // Create a slightly larger bounding box for the zombie
    const zombieBox = new THREE.Box3().setFromCenterAndSize(zombiePosition, new THREE.Vector3(3, 3, 3));

    let avoiding = false;

    obstacles.forEach(obstacle => {
        if (obstacle.boundingBox.intersectsBox(zombieBox)) {
            avoiding = true;

            const closestPoint = obstacle.boundingBox.clampPoint(zombiePosition, new THREE.Vector3());
            const avoidDirection = new THREE.Vector3().subVectors(zombiePosition, closestPoint).normalize();
            
            // Calculate distance to obstacle surface
            const distanceToObstacle = zombiePosition.distanceTo(closestPoint);
            
            // Apply stronger avoidance force when very close to obstacle
            const scaleFactor = Math.max(0, minimumSeparation - distanceToObstacle) * avoidanceStrength;
            
            avoidanceForce.add(avoidDirection.multiplyScalar(scaleFactor));
        }
    });

    if (avoiding && avoidanceForce.length() > 0) {
        const blendedDirection = new THREE.Vector3()
            .addVectors(directionToPlayer, avoidanceForce)
            .normalize();

        // Use raycasting to check for collisions along the path
        // Now apply movement and check validity with bounding boxes
        const newPosition = zombiePosition.clone().add(blendedDirection.multiplyScalar(zombieSpeed * delta));
        const newZombieBox = new THREE.Box3().setFromCenterAndSize(newPosition, new THREE.Vector3(3, 3, 3));

        // Check if the new position is valid
        const canMove = !obstacles.some(obstacle => obstacle.boundingBox.intersectsBox(newZombieBox));

        if (canMove) {
            // Update the zombie's position if valid
            zombiePosition.copy(newPosition);
        }


        return blendedDirection.multiplyScalar(zombieSpeed * delta);
    }

    return directionToPlayer.multiplyScalar(zombieSpeed * delta);
}

function handleZombies(delta) {
    zombies.forEach(zombie => {
        const { fbx, mixer } = zombie;
        if (mixer) mixer.update(delta);

        const zombiePosition = new THREE.Vector3();
        const cameraPosition = new THREE.Vector3(controls.object.position.x, 0, controls.object.position.z);
        fbx.getWorldPosition(zombiePosition);

        const direction = new THREE.Vector3().subVectors(cameraPosition, zombiePosition).normalize();
        fbx.lookAt(cameraPosition);

        const distanceToCamera = zombiePosition.distanceTo(cameraPosition);

        // Handle zombie death
        if (!zombie.isDead && isShiftPressed) {
            zombie.life--;
            console.log(`Zombie life: ${zombie.life}`);

            if (zombie.life <= 0) {
                zombie.isDead = true;
                const actions = [zombie.Dying1, zombie.Dying2];
                zombie.chosenAction = getRandomAction(zombie, actions);
                switchAction(zombie, zombie.chosenAction);
                return;
            }
        }

        // If the zombie is dead, handle death animations and removal
        if (zombie.isDead) {
            if (zombie.chosenAction && !zombie.chosenAction.isRunning()) {
                scene.remove(zombie.fbx);
                zombies.splice(zombies.indexOf(zombie), 1);
            }
            return;
        }

        // Smooth zombie movement when alive and distance is greater than minimum
        if (distanceToCamera > minimumDistance) {
            zombie.actionChosen = false;
            const avoidanceDirection = avoidObstacles(zombiePosition, direction, obstacles, zombieSpeed, delta);

            // Ensure the avoidance direction is valid and apply it
            if (!isNaN(avoidanceDirection.x) && !isNaN(avoidanceDirection.y) && !isNaN(avoidanceDirection.z)) {
                const newPosition = zombiePosition.clone().add(avoidanceDirection);
                
                // Check if the new position is valid (not inside any obstacle)
                const newZombieBox = new THREE.Box3().setFromCenterAndSize(newPosition, new THREE.Vector3(2, 2, 2));
                const canMove = !obstacles.some(obstacle => obstacle.boundingBox.intersectsBox(newZombieBox));
                
                if (canMove) {
                    fbx.position.copy(newPosition);
                }
            }

            // Adjust running animation based on speed
            if (zombie.runAction) {
                zombie.runAction.timeScale = zombieSpeed / 16;
                switchAction(zombie, zombie.runAction);
            }
        } else {

            if (playerLife > 0) {
                playerLife -= 0.5 * delta; // Decrement by 0.5 per second
                updateLifeBar(); // Update the life bar based on player's life
                if (playerLife <= 0) {
                    playerLife = 0;
                    alert('Game Over'); // End game if player's life reaches zero
                }
            }
            // Handle attacking actions if close to the player
            const actions = [zombie.punchAction, zombie.biteAction, zombie.biteNeckAction];
            if (!zombie.actionChosen) {
                zombie.chosenAction = getRandomAction(zombie, actions);
                zombie.actionChosen = true;
            }

            if (zombie.chosenAction) {
                switchAction(zombie, zombie.chosenAction);
            }
        }
    });
}

function genRandomColor() {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return `rgb(${r},${g},${b})`;
}

const paintballs = [];
const paintballsToRemove = [];

const splatTextures = [
    new THREE.TextureLoader().load('./assets/splatter-test1.png'),
    new THREE.TextureLoader().load('./assets/splatter-test2.png'),
    new THREE.TextureLoader().load('./assets/splatter-test1.png'),
    new THREE.TextureLoader().load('./assets/splatter-test2.png'),
];

splatTextures.forEach((texture) => {
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipMapLinearFilter;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 16;
});

// Function to create a splat on collision
function createSplat(intersectedObject, position, normal, color) {
    const size = new THREE.Vector3(0.85, 0.85, 0.85);
    const index = Math.floor(Math.random() * splatTextures.length);
    const texture = splatTextures[index];
    const splatMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        color: color,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        side: THREE.DoubleSide,
    });

    normal.normalize();

    // Offset the position slightly along the normal
    const offset = normal.clone().multiplyScalar(0.01);
    const splatPosition = position.clone().add(offset);

    const splatGeometry = new DecalGeometry(intersectedObject, splatPosition, normal, size);
    const splat = new THREE.Mesh(splatGeometry, splatMaterial);
    splat.renderOrder = 1;

    // Add splat to the scene
    scene.add(splat);
}

// Function to update the score
function updateScore() {
    const scoreElement = document.getElementById('score');
    scoreElement.innerText = `Score: ${score}`;
    console.log('Score:', score);
}

// Load the gun model
let gun;
const GLTFloader = new GLTFLoader();
GLTFloader.load('./submachine_gun.glb', function(gltf) {
    gun = gltf.scene;
    renderer.shadowMap.enabled = true;
    //directionalLight.castShadow = true;
    gun.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    gun.scale.set(0.01, 0.01, 0.01);  // Scale the gun to fit the player's hand
    gun.position.set(0.2, -0.1, -0.075); // Position relative to the player's view (adjust as needed)
    gun.rotation.set(0, Math.PI / 2, 0);
    gun.renderOrder = 2;
    camera.add(gun);  // Add the gun to the player's camera so it follows the view
    console.log("Gun loaded successfully:", gun);

}, undefined, function(error) {
    console.error("Error loading gun:", error);
});

// Function to apply recoil effect
function applyRecoil() {
    const recoilDistance = 0.05; // Adjust the recoil distance as needed
    const recoilRotation = 0.1; // Adjust the recoil rotation as needed

    // Apply recoil
    gun.position.z += recoilDistance;
    gun.rotation.x += recoilRotation;

    // Gradually return the gun to its original position and rotation
    // Gradually return the gun to its original position and rotation using GSAP
    gsap.to(gun.position, { z: gun.position.z - recoilDistance, duration: 0.25 });
    gsap.to(gun.rotation, { x: gun.rotation.x - recoilRotation, duration: 0.25 });
}

// Function to create a spark effect
function createSpark(position) {
    const sparkGeometry = new THREE.BufferGeometry();
    const sparkMaterial = new THREE.PointsMaterial({ color: 0xffa500, size: 0.1 });

    const sparkCount = 10;
    const positions = new Float32Array(sparkCount * 3);

    for (let i = 0; i < sparkCount; i++) {
        positions[i * 3] = position.x + (Math.random() - 0.5) * 0.2;
        positions[i * 3 + 1] = position.y + (Math.random() - 0.5) * 0.2;
        positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.2;
    }

    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
    scene.add(sparks);

    // Remove sparks after a short duration
    setTimeout(() => {
        scene.remove(sparks);
    }, 100);
}

// Function to create a bullet trail
function createBulletTrail(paintballMesh) {
    const trailMaterial = new THREE.LineBasicMaterial({ color: 0xffa500 });
    const trailGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(6); // Two points (start and end) with 3 coordinates each

    trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const trail = new THREE.Line(trailGeometry, trailMaterial);

    scene.add(trail);

    return trail;
}

// Load the gunshot sound
const listener = new THREE.AudioListener();
camera.add(listener);

const gunshotSound = new THREE.Audio(listener);
const audioLoader = new THREE.AudioLoader();
audioLoader.load('./gunshot.wav', (buffer) => {
    gunshotSound.setBuffer(buffer);
    gunshotSound.setVolume(0.5); // Adjust volume as needed
});

// Shooting logic with a max of 50 paintballs
function shootPaintball() {

    // Play the gunshot sound
    if (gunshotSound.isPlaying) {
        gunshotSound.stop();
    }
    gunshotSound.play();
    
    if (paintballs.length >= 50) {
        const oldestPaintball = paintballs.shift();
        world.removeBody(oldestPaintball.body);
        scene.remove(oldestPaintball.mesh);
        scene.remove(oldestPaintball.trail);
    }

    const paintballShape = new CANNON.Sphere(0.02);
    const paintballBody = new CANNON.Body({ mass: 0.01 });
    paintballBody.addShape(paintballShape);

    // Get the gun barrel position
    const gunBarrelPosition = new THREE.Vector3();
    gun.getWorldPosition(gunBarrelPosition);

    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    direction.normalize();

    // Offset the paintball's initial position slightly forward along the shooting direction
    const offset = direction.clone().multiplyScalar(0.75); // Adjust the scalar value as needed

    paintballBody.position.set(
        gunBarrelPosition.x + offset.x,
        gunBarrelPosition.y + offset.y,
        gunBarrelPosition.z + offset.z
    );

    paintballBody.velocity.set(
        direction.x * 100,
        direction.y * 100,
        direction.z * 100
    );

    world.addBody(paintballBody);

    const paintballGeometry = new THREE.SphereGeometry(0.02, 32, 32);
    const paintballMaterial = new THREE.MeshStandardMaterial({ color: genRandomColor() });
    const paintballMesh = new THREE.Mesh(paintballGeometry, paintballMaterial);
    paintballMesh.position.copy(paintballBody.position);
    scene.add(paintballMesh);

    // Create bullet trail
    const trail = createBulletTrail(paintballMesh);

    paintballs.push({ body: paintballBody, mesh: paintballMesh, trail: trail });

    createSpark(paintballBody.position);
    applyRecoil();

   // Add collision event listener
   paintballBody.addEventListener('collide', (event) => {
        const collidedWith = event.body; // The body the paintball collided with
        console.log('Paintball collided with:', collidedWith);
        
        // Check if the collided body is a zombie
        const zombie = zombies.find(z => z.body === collidedWith);
        if (zombie) {
            // Decrease zombie's health
            zombie.life -= 1;
            console.log(`Zombie hit! Remaining life: ${zombie.life}`);
            if (zombie.life <= 0) {
                // Remove zombie from the scene and physics world
                scene.remove(zombie.fbx);
                world.removeBody(zombie.body);
                zombies.splice(zombies.indexOf(zombie), 1);
                console.log('Zombie killed!');
            }
        }

        // Get the corresponding THREE.Mesh object
        const intersectedObject = bodyMeshMap.get(collidedWith);

        if (intersectedObject) {
            // Add a mark at the collision point
            const contact = event.contact;
            const collisionPoint = new THREE.Vector3().copy(contact.rj).applyQuaternion(collidedWith.quaternion);
            const collisionNormal = new THREE.Vector3().copy(contact.ni);
            createSplat(intersectedObject, collisionPoint, collisionNormal, paintballMesh.material.color);
        }

        // Mark paintball for removal on collision
        paintballsToRemove.push({ body: paintballBody, mesh: paintballMesh });
    });
}

document.addEventListener('mousedown', shootPaintball);

// Update loop
function updatePhysics(deltaTime) {
    world.step(deltaTime);

    // Apply movement
    const velocity = characterBody.velocity;
    velocity.x = 0;
    velocity.z = 0;

    const speed = 10;

    const direction = new THREE.Vector3();
    controls.getDirection(direction);

    if (moveForward) {
        velocity.x += direction.x * speed;
        velocity.z += direction.z * speed;
    }
    if (moveBackward) {
        velocity.x -= direction.x * speed;
        velocity.z -= direction.z * speed;
    }
    if (moveLeft) {
        velocity.x += direction.z * speed;
        velocity.z -= direction.x * speed;
    }
    if (moveRight) {
        velocity.x -= direction.z * speed;
        velocity.z += direction.x * speed;
    }

    // Update camera position
    camera.position.copy(characterBody.position);
    camera.position.y = 3; // Adjust the camera height as needed

    if (worldTerrain && !isOnGround) {
        checkIfOnGround();
    }

    // Update zombies' positions
    zombies.forEach(zombie => {
        if (zombie.body) {
            // Sync the position of the Three.js mesh with the Cannon.js physics body
            zombie.fbx.position.copy(zombie.body.position);
            zombie.fbx.quaternion.copy(zombie.body.quaternion);

            // Ensure zombies stay within the world bounds
            const minX = -300, maxX = 300;
            const minY = 0, maxY = 10; // Keeping Y as 1 for ground level
            const minZ = -300, maxZ = 300;

            if (zombie.body.position.x < minX) zombie.body.position.x = minX;
            if (zombie.body.position.x > maxX) zombie.body.position.x = maxX;
            if (zombie.body.position.y < minY) zombie.body.position.y = minY;
            if (zombie.body.position.y > maxY) zombie.body.position.y = maxY;
            if (zombie.body.position.z < minZ) zombie.body.position.z = minZ;
            if (zombie.body.position.z > maxZ) zombie.body.position.z = maxZ;

            // Example: Simple AI for zombie movement towards the player
            const zombieVelocity = zombie.body.velocity;
            const toPlayer = new THREE.Vector3().subVectors(characterBody.position, zombie.body.position);
            toPlayer.normalize();
            const zombieSpeed = 5; // Adjust speed as needed
            zombieVelocity.x = toPlayer.x * zombieSpeed;
            zombieVelocity.z = toPlayer.z * zombieSpeed;
        }
    });

    // Update paintball positions and trails
    paintballs.forEach(paintball => {
        paintball.mesh.position.copy(paintball.body.position);

        // // Update trail
        // const positions = paintball.trail.geometry.attributes.position.array;
        // positions[0] = paintball.body.previousPosition.x;
        // positions[1] = paintball.body.previousPosition.y;
        // positions[2] = paintball.body.previousPosition.z;
        // positions[3] = paintball.body.position.x;
        // positions[4] = paintball.body.position.y;
        // positions[5] = paintball.body.position.z;
        // paintball.trail.geometry.attributes.position.needsUpdate = true;
    });

    // Remove paintballs marked for removal
    paintballsToRemove.forEach(paintball => {
        world.removeBody(paintball.body);
        scene.remove(paintball.mesh);
        scene.remove(paintball.trail);
        const index = paintballs.indexOf(paintball);
        if (index > -1) {
            paintballs.splice(index, 1);
        }
    });
    paintballsToRemove.length = 0; // Clear the array
}

// Function to check if the character is on the ground
function checkIfOnGround() {
    const ray = new CANNON.Ray();
    ray.from = new CANNON.Vec3().copy(characterBody.position);
    ray.to = new CANNON.Vec3(characterBody.position.x, characterBody.position.y - 1, characterBody.position.z); // Cast ray downward

    const result = new CANNON.RaycastResult();
    ray.intersectBody(worldTerrain, result);

    isOnGround = result.hasHit;
}
       
        let moveForward = false;
        let moveBackward = false;
        let moveLeft = false;
        let moveRight = false;
        let canJump = false;
        let velocityY = 0;
        const gravity = -9.8;
        const jumpHeight = 5;
        let isOnGround = true;
        let isShiftPressed = false;

        const onKeyDown = function (event) {
            switch (event.code) {
                case 'ShiftLeft':
                    isShiftPressed = true;
                    break;
            
                case 'KeyP':
                    if (isPaused) {
                        resumeGame();
                    } else {
                        pauseGame();
                    }
                    break;

                case 'KeyW':
                    moveForward = true;
                    break;
                case 'KeyA':
                    moveLeft = true;
                    break;
                case 'KeyS':
                    moveBackward = true;
                    break;
                case 'KeyD':
                    moveRight = true;
                    break;
                case 'Space':
                    if (isOnGround) {
                        console.log("Jumping"); 
                        characterBody.velocity.y = jumpHeight;
                        isOnGround = false;
                    }
                    break;
            }
        };

        const onKeyUp = function (event) {
            switch (event.code) {
                case 'ShiftLeft':
                    isShiftPressed = false;
                    break;
                case 'KeyW':
                    moveForward = false;
                    break;
                case 'KeyA':
                    moveLeft = false;
                    break;
                case 'KeyS':
                    moveBackward = false;
                    break;
                case 'KeyD':
                    moveRight = false;
                    break;
            }
        };

        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);

        document.addEventListener('click', function () {
            startBackgroundSound();

            controls.lock();
        });

        controls.addEventListener('lock', function () {
            instructions.style.display = 'none';
        });

        controls.addEventListener('unlock', function () {
            instructions.style.display = 'block';
        });

        controls.object.position.set(80, 2, 80);
        scene.add(controls.object);

        // Animation loop
        const clock = new THREE.Clock();
        function animate() {
            const delta = clock.getDelta();
            const val = 1/60;
            updatePhysics(val);

            // Update wall positions
            bodyMeshMap.forEach((mesh, body) => {
                mesh.position.copy(body.position);
                mesh.quaternion.copy(body.quaternion);
            });

            if (!isGameOver&&!isPaused) {
                handleZombies(delta);
                // ... (rest of your animate function)
            }
            
            checkGameOver();
            
            if (!isPaused) {

                requestAnimationFrame(animate);

            // if (controls.isLocked === true) {

                

            //     const moveSpeed = 20;
            //     const velocity = new THREE.Vector3();

            //     if (moveForward) velocity.z += moveSpeed * delta;
            //     if (moveBackward) velocity.z -= moveSpeed * delta;
            //     if (moveLeft) velocity.x -= moveSpeed * delta;
            //     if (moveRight) velocity.x += moveSpeed * delta;

            //     controls.moveRight(velocity.x);
            //     controls.moveForward(velocity.z);

            //     // Apply gravity
            //     velocityY += gravity * delta;
            //     const playerPos = controls.object.position.clone();

            //     // Calculate the new position
            //     const newPosition = playerPos.clone();
            //     newPosition.x += velocity.x;
            //     newPosition.z += velocity.z;
            //     newPosition.y += velocityY * delta;

            //     // Get terrain height at the new position
            //     const terrainHeight = getTerrainHeight(
            //         newPosition.x, newPosition.z, 
            //         terrainGeometry, width, length, 128
            //     );
    

            //     // Check for collisions with the ground
            //     if (newPosition.y < terrainHeight+4) {
            //         velocityY = 0;
            //         newPosition.y = terrainHeight+4;
            //         isOnGround = true;
            //     }

            //     // Update player bounding box position based on camera
            //     const playerPosition = controls.object.position;
            //     playerBoundingBox.min.set(
            //         playerPosition.x - 0.5,
            //         playerPosition.y - 2,
            //         playerPosition.z - 0.5
            //     );
            //     playerBoundingBox.max.set(
            //         playerPosition.x + 0.5,
            //         playerPosition.y,
            //         playerPosition.z + 0.5
            //     );

            //     // Collision detection: Prevent moving into obstacles
            //     obstacles.forEach(obstacle => {
            //         if (playerBoundingBox.intersectsBox(obstacle.boundingBox)) {
            //             // If colliding, stop movement
            //             controls.moveRight(-velocity.x);
            //             controls.moveForward(-velocity.z);
            //         }
            //     });

            //     // Keep the player within the arena bounds
            //     playerPosition.x = Math.max(-width/2-1, Math.min(width/2-1, playerPosition.x));
            //     playerPosition.z = Math.max(-width/2-1, Math.min(width/2-1, playerPosition.z));
            //     playerPosition.y = Math.max(playerPosition.y, terrainHeight + 4);

            // }
            
                animateSun();
                animateMoon();
                updateSkyColor();

                    updateMinimap();
                    checkPowerUpCollection();
                

                renderer.render(scene, camera);
            }
           
        }
        animate();

        // Handle window resizing
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();

            renderer.setSize(window.innerWidth, window.innerHeight);
        });