# Project 3D assets

Put optimized `.glb` files in `static/models/`, then set the matching `model` value in
`data/publications.yaml`, for example:

```yaml
scene: "skelebones"
model: "/models/gaussianimate.glb"
```

The homepage viewer automatically centers and scales the model. Keep each web asset below
about 8 MB, use Draco or Meshopt compression, and bake textures to 2K or smaller. When
`model` is empty, the project-specific procedural placeholder is shown.
