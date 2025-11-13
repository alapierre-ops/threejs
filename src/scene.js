import * as THREE from 'three/webgpu'
import { createStandardMaterial, loadGltf, textureloader } from './tools.js'

export class Scene {
    constructor() {
        this.scene = new THREE.Scene()
        this.loadedModels = new Map()
        this.loadedSkyboxes = new Map()
        this.currentSceneParams = {}
        this.ground = null
        this.directionalLight = null
        this.directionalLightHelper = null
    }

    addAmbientLight() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.1)
        this.scene.add(ambientLight)
    }

    addDirectionalLight() {
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5)
        directionalLight.position.set(10, 20, 10)
        directionalLight.castShadow = true
        directionalLight.shadow.mapSize.width = 2048
        directionalLight.shadow.mapSize.height = 2048

        directionalLight.shadow.camera.left = -100
        directionalLight.shadow.camera.right = 100
        directionalLight.shadow.camera.top = 100
        directionalLight.shadow.camera.bottom = -100
        directionalLight.shadow.camera.near = 0.1
        directionalLight.shadow.camera.far = 1000
        this.scene.add(directionalLight.target)
        this.scene.add(directionalLight)

        const helper = new THREE.DirectionalLightHelper(directionalLight, 5)
        this.scene.add(helper)

        this.directionalLight = directionalLight
        this.directionalLightHelper = helper

        return directionalLight
    }

    async addSkybox(filename) {
        if (!filename) {
            return null
        }

        let skyboxTexture = this.loadedSkyboxes.get(filename)
        if (!skyboxTexture) {
            skyboxTexture = await textureloader.loadAsync(`skybox/${filename}`)
            skyboxTexture.mapping = THREE.EquirectangularReflectionMapping
            skyboxTexture.colorSpace = THREE.SRGBColorSpace
            this.loadedSkyboxes.set(filename, skyboxTexture)
        }

        this.scene.background = skyboxTexture
        this.scene.environment = skyboxTexture

        return skyboxTexture
    }

    async loadScene(url) {
        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`Impossible de charger la scène: ${url}`)
        }

        const sceneData = await response.json()
        this.currentSceneParams = sceneData.params ?? {}

        const nodes = sceneData.nodes ?? []

        for (const node of nodes) {
            if (!node?.name) {
                continue
            }

            let baseModel = this.loadedModels.get(node.name)
            if (!baseModel) {
                baseModel = await loadGltf(node.name)
                this.loadedModels.set(node.name, baseModel)
            }

            const instance = baseModel.clone(true)
            instance.name = node.name

            if (node.position) {
                instance.position.fromArray(
                    typeof node.position === 'string'
                        ? node.position.split(',').map(Number)
                        : node.position
                )
            }

            if (node.rotation) {
                instance.quaternion.fromArray(
                    typeof node.rotation === 'string'
                        ? node.rotation.split(',').map(Number)
                        : node.rotation
                )
            }

            if (node.scale) {
                instance.scale.fromArray(
                    typeof node.scale === 'string'
                        ? node.scale.split(',').map(Number)
                        : node.scale
                )
            }

            instance.traverse((o) => {
                if (o.isMesh) {
                    o.castShadow = true
                    o.receiveShadow = true
                    o.userData = {
                        ...(o.userData ?? {}),
                        isSelectable: true,
                        object: instance,
                    }
                }
            })

            this.scene.add(instance)
        }

        return sceneData
    }

    async addObject(modelName, position = null, rotation = null, scale = null) {
        if (!modelName) {
            return null
        }

        let baseModel = this.loadedModels.get(modelName)
        if (!baseModel) {
            baseModel = await loadGltf(modelName)
            this.loadedModels.set(modelName, baseModel)
        }

        const instance = baseModel.clone(true)
        instance.name = modelName

        if (position) {
            instance.position.fromArray(
                typeof position === 'string'
                    ? position.split(',').map(Number)
                    : position
            )
        } else {
            instance.position.set(0, 0, 0)
        }

        if (rotation) {
            instance.quaternion.fromArray(
                typeof rotation === 'string'
                    ? rotation.split(',').map(Number)
                    : rotation
            )
        }

        if (scale) {
            instance.scale.fromArray(
                typeof scale === 'string'
                    ? scale.split(',').map(Number)
                    : scale
            )
        }

        instance.traverse((o) => {
            if (o.isMesh) {
                o.castShadow = true
                o.receiveShadow = true
                o.userData = {
                    ...(o.userData ?? {}),
                    isSelectable: true,
                    object: instance,
                }
            }
        })

        this.scene.add(instance)
        return instance
    }

    removeObject(object) {
        if (!object) {
            return false
        }

        this.scene.remove(object)
        
        object.traverse((child) => {
            if (child.geometry) child.geometry.dispose()
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach((mat) => mat.dispose())
                } else {
                    child.material.dispose()
                }
            }
        })

        return true
    }

    duplicateObject(object) {
        if (!object) {
            return null
        }

        const cloned = object.clone(true)
        cloned.name = object.name
        
        cloned.position.copy(object.position)
        cloned.position.x += 1
        
        cloned.quaternion.copy(object.quaternion)
        cloned.scale.copy(object.scale)

        cloned.traverse((o) => {
            if (o.isMesh) {
                o.castShadow = true
                o.receiveShadow = true
                o.userData = {
                    ...(o.userData ?? {}),
                    isSelectable: true,
                    object: cloned,
                }
            }
        })

        this.scene.add(cloned)
        return cloned
    }

    clearScene() {
        const objectsToRemove = []
        this.scene.traverse((object) => {
            if (object.userData?.isSelectable) {
                const parentObject = object.userData?.object || object
                if (!objectsToRemove.includes(parentObject)) {
                    objectsToRemove.push(parentObject)
                }
            }
        })

        objectsToRemove.forEach((obj) => {
            this.scene.remove(obj)
            if (obj.dispose) {
                obj.traverse((child) => {
                    if (child.geometry) child.geometry.dispose()
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach((mat) => mat.dispose())
                        } else {
                            child.material.dispose()
                        }
                    }
                })
            }
        })
    }

    async importScene(event, params) {
        const file = event.target.files[0]
        if (!file) {
            return
        }

        this.clearScene()

        const text = await file.text()
        const sceneData = JSON.parse(text)

        this.currentSceneParams = sceneData.params ?? {}

        const nodes = sceneData.nodes ?? []

        for (const node of nodes) {
            if (!node?.name) {
                continue
            }

            let baseModel = this.loadedModels.get(node.name)
            if (!baseModel) {
                baseModel = await loadGltf(node.name)
                this.loadedModels.set(node.name, baseModel)
            }

            const instance = baseModel.clone(true)
            instance.name = node.name

            if (node.position) {
                instance.position.fromArray(
                    typeof node.position === 'string'
                        ? node.position.split(',').map(Number)
                        : node.position
                )
            }

            if (node.rotation) {
                instance.quaternion.fromArray(
                    typeof node.rotation === 'string'
                        ? node.rotation.split(',').map(Number)
                        : node.rotation
                )
            }

            if (node.scale) {
                instance.scale.fromArray(
                    typeof node.scale === 'string'
                        ? node.scale.split(',').map(Number)
                        : node.scale
                )
            }

            instance.traverse((o) => {
                if (o.isMesh) {
                    o.castShadow = true
                    o.receiveShadow = true
                    o.userData = {
                        ...(o.userData ?? {}),
                        isSelectable: true,
                        object: instance,
                    }
                }
            })

            this.scene.add(instance)
        }

        if (params) {
            if (params.skybox?.file) {
                await this.addSkybox(params.skybox.file)
            }
            if (params.ground?.texture && params.ground?.repeats) {
                this.changeGround(params.ground.texture, params.ground.repeats)
            }
        }

        return sceneData
    }

    addCube() {
        const geometry = new THREE.BoxGeometry(1, 1, 1)
        const material = new THREE.MeshStandardMaterial({ color: 0xff0000 })
        const cube = new THREE.Mesh(geometry, material)

        cube.position.y = 1

        this.scene.add(cube)

        return cube
    }

    addGround(texture, repeats) {
        if (!this.ground) {
            const geometry = new THREE.PlaneGeometry(5000, 5000)
            this.ground = new THREE.Mesh(geometry)

            this.ground.rotation.x = -Math.PI / 2
            this.ground.position.y = 0
            this.ground.receiveShadow = true

            this.scene.add(this.ground)
        }

        return this.changeGround(texture, repeats)
    }

    changeGround(texture, repeats) {
        if (!this.ground) {
            console.warn('Ground not initialised, calling addGround first.')
            return null
        }

        if (this.ground.material) {
            this.ground.material.dispose()
        }

        const material = createStandardMaterial(texture, repeats)
        this.ground.material = material
        this.ground.material.needsUpdate = true

        return this.ground
    }

    updateSun(params) {
        if (!this.directionalLight) {
            console.warn('Directional light not initialised, call addDirectionalLight first.')
            return null
        }

        if (typeof params.intensity === 'number') {
            this.directionalLight.intensity = params.intensity
        }

        if (typeof params.color !== 'undefined' && params.color !== null) {
            this.directionalLight.color.set(params.color)
            if (this.directionalLightHelper?.material?.color) {
                this.directionalLightHelper.material.color.set(params.color)
            }
        }

        const currentPosition = this.directionalLight.position.clone()
        if (typeof params.x === 'number') {
            currentPosition.x = params.x
        }
        if (typeof params.y === 'number') {
            currentPosition.y = params.y
        }
        if (typeof params.z === 'number') {
            currentPosition.z = params.z
        }

        this.directionalLight.position.copy(currentPosition)
        this.directionalLight.target.position.set(0, 0, 0)

        if (this.directionalLightHelper) {
            this.directionalLightHelper.update()
        }

        return this.directionalLight
    }
}