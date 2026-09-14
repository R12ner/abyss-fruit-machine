## 弹珠机界面。整个界面画在 720 × 600 的画布上，和网页版同一套坐标，
## 所以几何、赔付表和落球路径可以原样复用 PlinkoRules。
##
## 这一层只管「画」和「收按键」，一条规则都不写 —— 规则全在 PlinkoRules 里。
## 界面挂在 SubViewport 里，由 CRTScreen 贴到 3D 的屏幕网格上。
extends Control

const CANVAS := Vector2(720, 600)
const DROP_SECONDS := 2.6

const FELT_DARK := Color("#071a11")
const FELT := Color("#12402b")
const GOLD := Color("#d2b76c")
const GOLD_BRIGHT := Color("#f3dda3")
const CREAM := Color("#e6dec2")
const MUTED := Color("#8b9784")

var rows := 12
var risk := "classic"
var bet := 10

var _round: Dictionary = {}
var _progress := 0.0
var _last_payout := 0
var _last_slot := -1
var _rng := RandomNumberGenerator.new()

var _drop_button: Button
var _status: Label


func _ready() -> void:
	_rng.randomize()
	custom_minimum_size = CANVAS
	_build_controls()
	Wallet.balance_changed.connect(_on_balance_changed)
	set_process(true)


func _on_balance_changed(_balance: int) -> void:
	queue_redraw()


func _build_controls() -> void:
	# 红色投球键：够大、够红，是个人都知道要按
	_drop_button = Button.new()
	_drop_button.text = "释放弹珠"
	_drop_button.position = Vector2(270, 534)
	_drop_button.size = Vector2(180, 48)
	_drop_button.add_theme_font_size_override("font_size", 20)
	_drop_button.add_theme_color_override("font_color", Color("#fff2d1"))

	var normal := StyleBoxFlat.new()
	normal.bg_color = Color("#a93a36")
	normal.border_color = Color("#35171a")
	normal.set_border_width_all(3)
	normal.set_corner_radius_all(10)
	_drop_button.add_theme_stylebox_override("normal", normal)

	var pressed := normal.duplicate() as StyleBoxFlat
	pressed.bg_color = Color("#7c2225")
	_drop_button.add_theme_stylebox_override("pressed", pressed)

	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color("#c04a44")
	_drop_button.add_theme_stylebox_override("hover", hover)

	_drop_button.pressed.connect(_on_drop)
	add_child(_drop_button)

	_status = Label.new()
	_status.position = Vector2(20, 566)
	_status.size = Vector2(680, 26)
	_status.text = "按红键投球 · 每颗 %d USD" % bet
	_status.add_theme_color_override("font_color", MUTED)
	add_child(_status)


func _on_drop() -> void:
	if not _round.is_empty():
		return
	if Wallet.spend(bet) != bet:
		_status.text = "钱包余额不足"
		return
	_round = PlinkoRules.create_round(bet, risk, rows, false, _rng)
	_progress = 0.0
	_drop_button.disabled = true
	_status.text = "弹珠穿过钉阵…"


func _process(delta: float) -> void:
	if _round.is_empty():
		return
	_progress += delta / DROP_SECONDS
	if _progress >= 1.0:
		_settle()
	queue_redraw()


func _settle() -> void:
	_last_payout = _round["payout"]
	_last_slot = _round["slot"]
	Wallet.deposit(_last_payout)
	_status.text = "落入第 %d 槽 · ×%.1f · 得币 %d USD" % [
		_last_slot + 1, _round["multiplier"], _last_payout
	]
	_round = {}
	_progress = 0.0
	_drop_button.disabled = false


## ---------- 绘制 ----------
func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, CANVAS), FELT_DARK)
	_draw_board()
	_draw_pegs()
	_draw_slots()
	_draw_ball()
	_draw_hud()


func _draw_board() -> void:
	var spacing := PlinkoRules.BOARD_WIDTH / rows
	var half_width := rows * spacing / 2.0 + spacing
	var apex := Vector2(360, 62)
	var left := Vector2(360 - half_width, PlinkoRules.SLOT_TOP + 40)
	var right := Vector2(360 + half_width, PlinkoRules.SLOT_TOP + 40)

	draw_colored_polygon(PackedVector2Array([apex, right, left]), FELT)
	draw_polyline(PackedVector2Array([apex, right, left, apex]), GOLD, 3.0, true)


func _draw_pegs() -> void:
	var columns := _current_columns()
	for row in range(rows):
		for col in range(row + 1):
			var centre := Vector2(
				PlinkoRules.peg_x(rows, row, col),
				PlinkoRules.peg_y(rows, row)
			)
			var is_gold := _is_gold_peg(row, col)
			var is_hit := columns.size() > row and columns[row] == col and not _round.is_empty()
			var radius := clampf(PlinkoRules.BOARD_WIDTH / rows / 8.0, 2.6, 6.0)

			draw_circle(centre + Vector2(1, 2), radius + 1.0, Color(0, 0, 0, 0.5))
			var tint := GOLD_BRIGHT if is_gold else (Color.WHITE if is_hit else GOLD)
			draw_circle(centre, radius * (1.35 if is_hit else 1.0), tint)


func _draw_slots() -> void:
	var table := PlinkoRules.paytable(rows, risk)
	var spacing := PlinkoRules.BOARD_WIDTH / rows
	var width := maxf(20.0, spacing - 4.0)
	var font := ThemeDB.fallback_font

	for index in range(table.size()):
		var centre := PlinkoRules.slot_center(rows, index)
		var box := Rect2(centre - width / 2.0, PlinkoRules.SLOT_TOP, width, 38)
		var edge := abs(index - rows / 2.0) / (rows / 2.0)
		var fill := Color("#c8713a") if edge > 0.74 else (
			Color("#a88448") if edge > 0.42 else Color("#2f4a30"))
		if index == _last_slot and _round.is_empty():
			fill = Color("#e8c46a")

		draw_rect(box, fill)
		draw_rect(box, Color(0, 0, 0, 0.45), false, 1.0)

		var label := "%.1f×" % (table[index] / 10.0)
		var size := font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 13)
		draw_string(font, Vector2(centre - size.x / 2.0, PlinkoRules.SLOT_TOP + 25),
			label, HORIZONTAL_ALIGNMENT_LEFT, -1, 13,
			Color("#2b2109") if index == _last_slot and _round.is_empty() else CREAM)


func _draw_ball() -> void:
	var point: Vector2
	if _round.is_empty():
		point = Vector2(360, 62)
	else:
		var at := PlinkoRules.position_at(_round, _progress)
		point = Vector2(at["x"], at["y"])

	draw_circle(point + Vector2(1, 3), 9.0, Color(0, 0, 0, 0.45))
	draw_circle(point, 8.0, Color("#fffef1"))
	draw_circle(point - Vector2(2, 3), 3.0, Color("#ffffff"))


func _draw_hud() -> void:
	var font := ThemeDB.fallback_font
	draw_string(font, Vector2(20, 34), "钱包 %d USD" % Wallet.balance(),
		HORIZONTAL_ALIGNMENT_LEFT, -1, 18, GOLD)
	draw_string(font, Vector2(20, 58), "%d 层 · %s 档" % [
		rows, PlinkoRules.RISKS[risk]["label"]],
		HORIZONTAL_ALIGNMENT_LEFT, -1, 14, MUTED)
	if _last_payout > 0:
		draw_string(font, Vector2(560, 34), "上局 +%d" % _last_payout,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 18, GOLD_BRIGHT)


## ---------- 小工具 ----------
func _current_columns() -> Array[int]:
	if _round.is_empty():
		return []
	var columns: Array[int] = [0]
	var cursor := 0
	for step in _round["directions"]:
		cursor += step
		columns.append(cursor)
	return columns


func _is_gold_peg(row: int, col: int) -> bool:
	if _round.is_empty():
		return false
	for pair in _round["gold"]:
		if pair.x == row and pair.y == col:
			return true
	return false
