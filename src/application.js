import * as THREE from 'three/webgpu'
import { Scene } from './scene'
import { Camera } from './camera'
import { UI } from './ui'

export class Application {
    
    constructor() {
        this.renderer = new THREE.WebGPURenderer({antialias: true})
        this.renderer.setSize(window.innerWidth, window.innerHeight)
        this.renderer.shadowMap.enabled = true
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
        document.body.appendChild(this.renderer.domElement)

        this.initParams()

        this.sunState = {
            angle: Math.PI / 4,
        }
        this.previousTime = null

        this.selectedObject = null
        this.selectedMesh = null
        this.selectedMeshMaterial = null
        this.moveSelectedObject = false

        this.raycaster = new THREE.Raycaster()
        this.pointer = new THREE.Vector2()
        this.selectionMaterial = new THREE.MeshStandardMaterial({
            color: 0xffff00,
            emissive: 0x222200,
            metalness: 0,
            roughness: 0.5,
        })

        this.onPointerClick = this.onPointerClick.bind(this)
        window.addEventListener('click', this.onPointerClick)

        this.onKeyDown = this.onKeyDown.bind(this)
        window.addEventListener('keydown', this.onKeyDown)

        this.onMouseMove = this.onMouseMove.bind(this)
        window.addEventListener('mousemove', this.onMouseMove)

        this.ui = new UI()
        this.ui.addSelectionInfoUI()
        this.ui.addCameraControlsUI(
            this.cameraParams,
            (value) => {
                this.cameraManager.setWASDMovement(value)
            }
        )
        this.ui.addSceneEditorUI(
            this.availableModels,
            (modelName) => this.addObjectToScene(modelName),
            () => this.deleteSelectedObject()
        )
        this.ui.addSceneControlsUI(
            () => this.exportScene({
                skybox: this.skyboxParams,
                ground: this.groundParams
            }),
            () => this.importScene(),
            () => this.clearScene()
        )

        this.sceneManager = new Scene()
        this.sceneManager.addAmbientLight()
        this.sceneManager.addDirectionalLight()
        this.updateSunOrbit(0)
        this.sceneManager.addGround(this.groundParams.texture, this.groundParams.repeats)
        this.sceneManager.addSkybox(this.skyboxParams.file).catch((error) => {
            console.error('Erreur lors du chargement de la skybox:', error)
        })

        this.cameraManager = new Camera(this.renderer)

        this.sceneManager.loadScene('/scenes/scene_1.json').catch((error) => {
            console.error('Erreur lors du chargement de la scène:', error)
        })

        this.ui.addSkyboxUI(
            this.skyboxFiles,
            this.skyboxParams,
            (value) => {
                this.sceneManager.addSkybox(value).catch((error) => {
                    console.error('Erreur lors du changement de skybox:', error)
                })
            }
        )

        this.ui.addGroundUI(
            this.groundTextures,
            this.groundParams,
            (params) => {
                this.sceneManager.changeGround(params.texture, params.repeats)
            }
        )

        this.ui.addSunUI(
            this.sunParams,
            () => {
                this.updateSunOrbit(0)
            }
        )

        this.updateSunOrbit(0)

        this.renderer.setAnimationLoop(this.render.bind(this))
    }

    initParams() {
        this.groundTextures = [
            'aerial_grass_rock',
            'brown_mud_leaves_01',
            'forest_floor',
            'forrest_ground_01',
            'gravelly_sand'
        ]

        this.skyboxFiles = [
            'DaySkyHDRI019A_2K-TONEMAPPED.jpg',
            'DaySkyHDRI050A_2K-TONEMAPPED.jpg',
            'NightSkyHDRI009_2K-TONEMAPPED.jpg'
        ]

        this.skyboxParams = {
            file: this.skyboxFiles[0]
        }

        this.groundParams = {
            texture: this.groundTextures[0],
            repeats: 100
        }

        this.sunParams = {
            intensity: 1.5,
            radiusX: 60,
            radiusZ: 60,
            height: 40,
            speed: 0.1,
            color: '#ffffff',
        }

        this.cameraParams = {
            wasdMovement: false
        }

        this.availableModels = [
            'birch1',
            'bush1',
            'bush2',
            'flowers1',
            'grass1',
            'log1',
            'oak1',
            'oak2',
            'oak3',
            'pine1',
            'spruce1',
            'stone1',
            'stone2',
            'stump1'
        ]
    }

    render(time = 0) {
        let delta = 0.016
        if (typeof time === 'number') {
            if (this.previousTime === null) {
                this.previousTime = time
            }
            delta = Math.min(Math.max((time - this.previousTime) / 1000, 0), 1)
            this.previousTime = time
            this.updateSunOrbit(delta)
        }
        
        this.cameraManager.update(delta)
        
        this.renderer.render(this.sceneManager.scene, this.cameraManager.camera)
    }

    onPointerClick(event) {
        if (event.target !== this.renderer.domElement) {
            return
        }

        const rect = this.renderer.domElement.getBoundingClientRect()

        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1

        this.pointer.set(x, y)
        this.raycaster.setFromCamera(this.pointer, this.cameraManager.camera)

        const intersects = this.raycaster.intersectObjects(
            this.sceneManager.scene.children,
            true
        )

        const hit = intersects.find(
            (intersection) => intersection.object?.userData?.isSelectable
        )

        if (hit) {
            const mesh = hit.object
            const owner = mesh.userData?.object ?? mesh
            this.selectMesh(owner, mesh)
        } else {
            this.clearSelection()
        }
    }

    updateSunOrbit(deltaTime = 0) {
        if (!this.sceneManager?.directionalLight) {
            return
        }

        const speed = this.sunParams.speed ?? 0
        if (deltaTime > 0 && speed !== 0) {
            this.sunState.angle = (this.sunState.angle + speed * deltaTime) % (Math.PI * 2)
        }

        const angle = this.sunState.angle
        const radiusX = this.sunParams.radiusX ?? 0
        const radiusZ = this.sunParams.radiusZ ?? 0
        const height = this.sunParams.height ?? this.sceneManager.directionalLight.position.y

        const x = radiusX * Math.cos(angle)
        const z = radiusZ * Math.sin(angle)
        const y = height

        this.sceneManager.updateSun({
            intensity: this.sunParams.intensity,
            color: this.sunParams.color,
            x,
            y,
            z,
        })
    }

    selectMesh(object, mesh) {
        if (this.selectedMesh === mesh) {
            return
        }

        this.clearSelection()

        const originalMaterial = mesh.material
        this.selectedMeshMaterial = Array.isArray(originalMaterial)
            ? originalMaterial.slice()
            : originalMaterial

        if (Array.isArray(originalMaterial)) {
            mesh.material = originalMaterial.map(() => this.selectionMaterial)
        } else {
            mesh.material = this.selectionMaterial
        }

        this.selectedObject = object
        this.selectedMesh = mesh
        
        this.ui.updateSelectionInfo(object)
    }

    clearSelection() {
        if (this.selectedMesh && this.selectedMeshMaterial) {
            this.selectedMesh.material = this.selectedMeshMaterial
        }

        this.selectedObject = null
        this.selectedMesh = null
        this.selectedMeshMaterial = null
        
        this.ui.updateSelectionInfo(null)
    }

    onKeyDown(event) {
        
        console.log('event', event.key)

        if (event.key === 'g' || event.key === 'G') {
            this.moveSelectedObject = !this.moveSelectedObject
        }
        
        if ((event.key === 'd' || event.key === 'D') && this.selectedObject) {
            console.log('duplicateSelectedObject')
            this.duplicateSelectedObject()
        }
        
        if ((event.key === 'Delete' || event.key === 'Backspace') && this.selectedObject) {
            this.deleteSelectedObject()
        }
    }

    onMouseMove(event) {
        if (!this.moveSelectedObject || !this.selectedObject) {
            return
        }

        if (event.target !== this.renderer.domElement) {
            return
        }

        const rect = this.renderer.domElement.getBoundingClientRect()
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1

        this.pointer.set(x, y)
        this.raycaster.setFromCamera(this.pointer, this.cameraManager.camera)

        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
        const intersection = new THREE.Vector3()
        this.raycaster.ray.intersectPlane(groundPlane, intersection)

        if (intersection) {
            const currentY = this.selectedObject.position.y
            this.selectedObject.position.set(intersection.x, currentY, intersection.z)
            this.ui.updateSelectionInfo(this.selectedObject)
        }
    }

    exportScene(params) {
        const nodes = []
        const processedObjects = new Set()

        this.sceneManager.scene.traverse((object) => {
            if (object.userData?.isSelectable) {
                const parentObject = object.userData?.object || object
                
                if (processedObjects.has(parentObject)) {
                    return
                }
                processedObjects.add(parentObject)

                const node = {
                    name: parentObject.name || 'unnamed'
                }

                if (parentObject.position) {
                    node.position = `${parentObject.position.x}, ${parentObject.position.y}, ${parentObject.position.z}`
                }

                if (parentObject.quaternion) {
                    node.rotation = `${parentObject.quaternion.x}, ${parentObject.quaternion.y}, ${parentObject.quaternion.z}, ${parentObject.quaternion.w}`
                }

                if (parentObject.scale) {
                    node.scale = `${parentObject.scale.x}, ${parentObject.scale.y}, ${parentObject.scale.z}`
                }

                nodes.push(node)
            }
        })

        const exportData = {
            params: params || this.sceneManager.currentSceneParams,
            nodes: nodes
        }

        const jsonStr = JSON.stringify(exportData, null, 2)
        const blob = new Blob([jsonStr], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'scene_export.json'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    clearScene() {
        this.sceneManager.clearScene()
        this.clearSelection()
    }

    importScene() {
        const importInput = document.createElement('input')
        importInput.type = 'file'
        importInput.accept = '.json,application/json'
        importInput.style.display = 'none'
        document.body.appendChild(importInput)

        importInput.addEventListener('change', async (event) => {
            try {
                await this.sceneManager.importScene(event, {
                    skybox: this.skyboxParams,
                    ground: this.groundParams
                })
            } catch (error) {
                console.error('Erreur lors de l\'importation de la scène:', error)
            }
            importInput.value = ''
        })

        importInput.click()
        
        setTimeout(() => {
            document.body.removeChild(importInput)
        }, 1000)
    }

    deleteSelectedObject() {
        if (!this.selectedObject) {
            return
        }

        this.sceneManager.removeObject(this.selectedObject)
        this.clearSelection()
    }

    async duplicateSelectedObject() {``
        console.log('this.selectedObject', this.selectedObject)
        if (!this.selectedObject) {
            return
        }

        console.log('this.sceneManager.duplicateObject(this.selectedObject)', this.sceneManager.duplicateObject(this.selectedObject))
        const duplicated = this.sceneManager.duplicateObject(this.selectedObject)
        if (duplicated) {
            this.selectMesh(duplicated, duplicated.children.find(child => child.isMesh) || duplicated)
        }
    }

    async addObjectToScene(modelName) {
        if (!modelName) {
            return
        }

        const camera = this.cameraManager.camera
        const direction = new THREE.Vector3(0, 0, -1)
        direction.applyQuaternion(camera.quaternion)
        direction.normalize()
        
        const distance = 10
        const position = camera.position.clone().add(direction.clone().multiplyScalar(distance))
        position.y = 0

        const newObject = await this.sceneManager.addObject(modelName, [position.x, position.y, position.z])
        if (newObject) {
            const mesh = newObject.children.find(child => child.isMesh) || newObject
            this.selectMesh(newObject, mesh)
        }
    }
}