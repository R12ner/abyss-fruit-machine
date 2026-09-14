## 桌面场景。
##
## 整个场景是用代码搭的，不是拖出来的 —— 这样你不用先有模型也能跑起来，
## 每个物件都是灰模占位。等美术资产到位，把对应的 MeshInstance3D 换成
## 导入的模型即可，灯光和相机不用动。
##
## 画面「像样」的关键全在 _build_environment() 和 _build_lights() 两处：
## 色温对比（暖台灯 vs 冷环境）、接触阴影、屏幕自发光、轻微景深。
## 这两处是默认场景和参考图之间的差距，不是模型精度。
extends Node3D

const PlinkoUI := preload("res://scenes/ui/plinko_ui.tscn")

var screen: CRTScreen


func _ready() -> void:
	_build_environment()
	_build_camera()
	_build_lights()
	_build_desk()
	_build_monitor()
	_build_props()


## ---------- 环境与后处理 ----------
func _build_environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.02, 0.03, 0.03)

	# 冷色环境光，和暖色台灯形成色温对比。这一条比什么都重要。
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.10, 0.16, 0.20)
	env.ambient_light_energy = 0.9

	# 接触阴影：物件和桌面交界处压暗，塑料感主要就是缺这个
	env.ssao_enabled = true
	env.ssao_radius = 0.35
	env.ssao_intensity = 2.4
	env.ssao_detail = 1.0

	# 间接光：屏幕的光会染到桌面上
	env.ssil_enabled = true
	env.ssil_intensity = 1.2
	env.ssil_radius = 3.0

	# 辉光：屏幕和指示灯会晕开
	env.glow_enabled = true
	env.glow_intensity = 0.55
	env.glow_bloom = 0.12
	env.glow_hdr_threshold = 0.92
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT

	# ACES 色调映射，比默认的 Linear 立刻高一档
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.0
	env.tonemap_white = 6.0

	# 房间里的一点浮尘
	env.volumetric_fog_enabled = true
	env.volumetric_fog_density = 0.012
	env.volumetric_fog_albedo = Color(0.55, 0.62, 0.58)

	var world := WorldEnvironment.new()
	world.environment = env
	add_child(world)


func _build_camera() -> void:
	var camera := Camera3D.new()
	camera.name = "Camera"
	camera.position = Vector3(0.0, 0.46, 0.62)
	camera.rotation_degrees = Vector3(-26.0, 0.0, 0.0)
	camera.fov = 48.0

	# 轻微景深：近处的道具微微失焦，画面立刻有「照片感」
	var attributes := CameraAttributesPractical.new()
	attributes.dof_blur_far_enabled = true
	attributes.dof_blur_far_distance = 1.3
	attributes.dof_blur_far_transition = 0.6
	attributes.dof_blur_amount = 0.06
	camera.attributes = attributes

	add_child(camera)


## ---------- 灯光 ----------
func _build_lights() -> void:
	# 桌灯：暖色、近距离、投影最软
	var lamp := OmniLight3D.new()
	lamp.name = "DeskLamp"
	lamp.position = Vector3(-0.42, 0.44, 0.16)
	lamp.light_color = Color(1.0, 0.78, 0.48)
	lamp.light_energy = 3.2
	lamp.omni_range = 1.6
	lamp.shadow_enabled = true
	lamp.light_size = 0.06
	add_child(lamp)

	# 屏幕外溢的冷光。屏幕材质自己也发光，这盏灯负责把光打到键盘和桌面上。
	var screen_spill := OmniLight3D.new()
	screen_spill.name = "ScreenSpill"
	screen_spill.position = Vector3(0.16, 0.36, 0.02)
	screen_spill.light_color = Color(0.50, 0.78, 0.86)
	screen_spill.light_energy = 1.1
	screen_spill.omni_range = 0.9
	screen_spill.shadow_enabled = false
	add_child(screen_spill)


## ---------- 家具与道具（全部灰模占位） ----------
func _make_box(box_name: String, size: Vector3, position: Vector3,
		color: Color, roughness := 0.7, metallic := 0.0) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size

	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = roughness
	material.metallic = metallic

	var instance := MeshInstance3D.new()
	instance.name = box_name
	instance.mesh = mesh
	instance.material_override = material
	instance.position = position
	add_child(instance)
	return instance


func _build_desk() -> void:
	_make_box("DeskTop", Vector3(1.8, 0.04, 0.9), Vector3(0, 0.18, 0),
		Color(0.20, 0.13, 0.09), 0.55)
	_make_box("BackWall", Vector3(3.0, 1.8, 0.06), Vector3(0, 0.7, -0.52),
		Color(0.07, 0.09, 0.10), 0.95)
	# 切割垫：参考图里那块绿色的板
	_make_box("CuttingMat", Vector3(0.86, 0.004, 0.52), Vector3(0.02, 0.202, 0.12),
		Color(0.09, 0.17, 0.14), 0.85)


func _build_monitor() -> void:
	var housing := _make_box("MonitorHousing", Vector3(0.42, 0.36, 0.34),
		Vector3(0.30, 0.38, -0.22), Color(0.72, 0.70, 0.62), 0.62)

	screen = CRTScreen.new()
	screen.name = "CRTScreen"
	# 稍微朝玩家转一点，屏幕正对相机
	screen.position = housing.position + Vector3(-0.02, 0.01, 0.172)
	screen.rotation_degrees = Vector3(0, -8.0, 0)
	add_child(screen)

	screen.mount(PlinkoUI.instantiate())


func _build_props() -> void:
	_make_box("Phone", Vector3(0.17, 0.07, 0.20), Vector3(-0.48, 0.235, -0.12),
		Color(0.42, 0.06, 0.07), 0.45)
	_make_box("Printer", Vector3(0.34, 0.10, 0.26), Vector3(-0.72, 0.25, 0.10),
		Color(0.80, 0.78, 0.71), 0.70)
	_make_box("Scanner", Vector3(0.30, 0.08, 0.24), Vector3(0.76, 0.24, 0.02),
		Color(0.30, 0.32, 0.38), 0.65)
