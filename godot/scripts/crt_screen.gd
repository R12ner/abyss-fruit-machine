## 机内显示器：把一个 SubViewport 里的 2D 界面贴到 3D 的屏幕网格上，
## 并把射到网格上的鼠标事件换算成视口里的坐标推回去。
##
## 这是整个「桌面上的电脑」方案的技术核心 —— 只要这一块成立，
## 现有四台机台的界面就能原样搬进 3D 场景里，不需要重做交互。
class_name CRTScreen
extends Node3D

## 屏幕网格的物理尺寸（米）。4:3 的 CRT 大概就是这个比例。
@export var screen_size := Vector2(0.32, 0.24)
## 视口分辨率。和网页版画布一致，界面代码可以直接照搬。
@export var resolution := Vector2i(720, 600)
## 屏幕自发光强度，这是让屏幕「照亮桌子」的关键。
@export var glow_energy := 1.4

var viewport: SubViewport
var mesh: MeshInstance3D

var _material: StandardMaterial3D
var _last_pixel := Vector2.ZERO


func _ready() -> void:
	_build_viewport()
	_build_mesh()
	_build_picker()
	# 等一帧让视口先渲染出内容，否则贴上去是黑的。
	await RenderingServer.frame_post_draw
	_material.albedo_texture = viewport.get_texture()
	_material.emission_texture = viewport.get_texture()


func _build_viewport() -> void:
	viewport = SubViewport.new()
	viewport.name = "ScreenViewport"
	viewport.size = resolution
	viewport.transparent_bg = false
	# ALWAYS：界面一直在动（跑灯、摆板），不能只更新一次。
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	# 我们自己转发事件，不让它去抢窗口的输入。
	viewport.handle_input_locally = true
	viewport.gui_embed_subwindows = false
	add_child(viewport)


func _build_mesh() -> void:
	var quad := QuadMesh.new()
	quad.size = screen_size

	_material = StandardMaterial3D.new()
	_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_material.emission_enabled = true
	_material.emission_energy_multiplier = glow_energy
	# 屏幕不该有高光反射，它自己是光源。
	_material.specular_mode = BaseMaterial3D.SPECULAR_DISABLED
	_material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS

	mesh = MeshInstance3D.new()
	mesh.name = "ScreenMesh"
	mesh.mesh = quad
	mesh.material_override = _material
	add_child(mesh)


## 拾取体：让射线打得到屏幕，_input_event 才会触发。
func _build_picker() -> void:
	var body := StaticBody3D.new()
	body.name = "ScreenPicker"
	body.input_ray_pickable = true

	var shape := BoxShape3D.new()
	shape.size = Vector3(screen_size.x, screen_size.y, 0.005)

	var collision := CollisionShape3D.new()
	collision.shape = shape
	body.add_child(collision)
	mesh.add_child(body)

	body.input_event.connect(_on_screen_input)


## 世界坐标的命中点 → 屏幕局部坐标 → 视口像素。
func _to_pixel(world_position: Vector3) -> Vector2:
	var local := mesh.to_local(world_position)
	var u := (local.x + screen_size.x * 0.5) / screen_size.x
	# 网格的 Y 轴朝上，视口的 Y 轴朝下，所以要翻过来。
	var v := 1.0 - (local.y + screen_size.y * 0.5) / screen_size.y
	return Vector2(
		clampf(u, 0.0, 1.0) * resolution.x,
		clampf(v, 0.0, 1.0) * resolution.y
	)


func _on_screen_input(_camera: Node, event: InputEvent, event_position: Vector3,
		_normal: Vector3, _shape_idx: int) -> void:
	var pixel := _to_pixel(event_position)

	if event is InputEventMouseButton:
		var click := (event as InputEventMouseButton).duplicate() as InputEventMouseButton
		click.position = pixel
		click.global_position = pixel
		viewport.push_input(click, true)
	elif event is InputEventMouseMotion:
		var motion := (event as InputEventMouseMotion).duplicate() as InputEventMouseMotion
		motion.position = pixel
		motion.global_position = pixel
		motion.relative = pixel - _last_pixel
		viewport.push_input(motion, true)

	_last_pixel = pixel


## 把一个界面场景装进屏幕。
func mount(ui: Control) -> void:
	for child in viewport.get_children():
		child.queue_free()
	ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	viewport.add_child(ui)
