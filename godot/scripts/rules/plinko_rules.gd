## 深渊弹珠机 · 纯规则层
##
## 从 dist/js/games/plinko/rules.mjs 一比一移植。这一层不碰任何节点、
## 不碰任何画面，所以能被测试直接调用，也能被 2D UI 或 3D 表现共用。
## 赔付一律用「十分之一倍」(tenths) 存，投注额是 10 的倍数，结算永远是整数。
class_name PlinkoRules
extends RefCounted

const ROW_OPTIONS: Array[int] = [8, 12, 16]
const STAKES: Array[int] = [10, 20, 50, 100]

const RISKS := {
	"low":     {"label": "低风险", "english": "STEADY",  "peak": 3.0,    "gamma": 1.6},
	"classic": {"label": "经典",   "english": "CLASSIC", "peak": 10.0,   "gamma": 1.9},
	"high":    {"label": "高倍",   "english": "HIGH",    "peak": 100.0,  "gamma": 2.4},
	"abyss":   {"label": "深渊",   "english": "ABYSS",   "peak": 1000.0, "gamma": 3.0},
}
const RISK_KEYS: Array[String] = ["low", "classic", "high", "abyss"]

## 基础赔付表的目标返还率；金钉与蓄能球会在此之上补足。
const BASE_RTP := 0.74
const GOLD_PEGS := 3
const ENERGY_GOAL := 16
const ENERGY_PER_DROP := 1
const ENERGY_PER_GOLD := 2
const CHARGED_MULTIPLIER := 2
const MAX_BALLS := 6

const BOARD_WIDTH := 528.0
const PEG_TOP := 108.0
const SLOT_TOP := 492.0

static var _paytables := {}


static func peg_count(rows: int) -> int:
	return rows * (rows + 1) / 2


## 每命中一枚金钉追加的倍率（十分之一倍），按钉数缩放，使各层数的加成期望一致。
static func gold_bonus_tenths(rows: int) -> int:
	return maxi(1, roundi(1.4 * peg_count(rows) / float(GOLD_PEGS * rows)))


## 每个落点的二项分布概率。
static func slot_probabilities(rows: int) -> Array[float]:
	var probs: Array[float] = []
	var total := pow(2.0, rows)
	var coefficient := 1.0
	for i in range(rows + 1):
		probs.append(coefficient / total)
		coefficient = coefficient * (rows - i) / float(i + 1)
	return probs


## 按「边缘峰值 + 曲线指数」生成赔付表，量化成十分之一倍后逐环补偿，
## 保证左右对称、由边缘向中间单调不增，并把返还率压在 BASE_RTP 附近。
static func _build_table(rows: int, peak: float, gamma: float) -> Array[int]:
	var probs := slot_probabilities(rows)
	var half := rows / 2
	var shape: Array[float] = []
	for i in range(rows + 1):
		shape.append(pow(peak, pow(abs(i - half) / float(half), gamma)))

	var raw := 0.0
	for i in range(shape.size()):
		raw += shape[i] * probs[i]

	var tenths: Array[int] = []
	for value in shape:
		tenths.append(maxi(0, roundi(value / raw * BASE_RTP * 10.0)))

	var expected := func() -> float:
		var sum := 0.0
		for i in range(tenths.size()):
			sum += tenths[i] * probs[i]
		return sum / 10.0

	var set_ring := func(ring: int, value: int) -> void:
		tenths[half - ring] = value
		tenths[half + ring] = value

	# 先压成「越靠中间越低」的单调形状
	for ring in range(half - 1, -1, -1):
		set_ring.call(ring, mini(tenths[half - ring], tenths[half - ring - 1]))

	# 再逐环补偿回目标返还率
	for guard in range(4000):
		var error := BASE_RTP - expected.call()
		if abs(error) < 0.003:
			break
		var ring := -1
		for candidate in range(half + 1):
			var value: int = tenths[half - candidate]
			var outer := 9223372036854775807 if candidate == half else tenths[half - candidate - 1]
			var inner := 0 if candidate == 0 else tenths[half - candidate + 1]
			var can_raise := error > 0 and value + 1 <= outer
			var can_lower := error <= 0 and value - 1 >= inner and value > 0
			if can_raise or can_lower:
				ring = candidate
				break
		if ring < 0:
			break
		set_ring.call(ring, tenths[half - ring] + (1 if error > 0 else -1))

	return tenths


## 取赔付表，结果缓存。返回的是十分之一倍的整数数组。
static func paytable(rows: int, risk: String) -> Array[int]:
	var key := "%d/%s" % [rows, risk]
	if not _paytables.has(key):
		var spec: Dictionary = RISKS[risk]
		_paytables[key] = _build_table(rows, spec["peak"], spec["gamma"])
	return _paytables[key]


## 钉阵几何。画布坐标系是 720 × 600，和网页版一致，
## 这样 UI 直接照搬，3D 表现只要把这个视口贴到屏幕网格上。
static func geometry(rows: int) -> Dictionary:
	var spacing := BOARD_WIDTH / rows
	return {
		"rows": rows,
		"spacing": spacing,
		"gap": minf(36.0, 372.0 / rows),
		"peg_top": PEG_TOP,
		"slot_top": SLOT_TOP,
	}


static func slot_center(rows: int, index: int) -> float:
	var spacing := BOARD_WIDTH / rows
	return 360.0 - rows * spacing / 2.0 + index * spacing


static func peg_x(rows: int, row: int, col: int) -> float:
	var spacing := BOARD_WIDTH / rows
	return 360.0 - row * spacing / 2.0 + col * spacing


static func peg_y(rows: int, row: int) -> float:
	return PEG_TOP + row * minf(36.0, 372.0 / rows)


## 开一颗球：先定路径再播动画，和网页版一样是「结果先定，动画只演」。
## rng 传进来是为了测试能复现。
static func create_round(bet: int, risk: String, rows: int, charged: bool, rng: RandomNumberGenerator) -> Dictionary:
	assert(bet in STAKES, "投注额必须是预设档位")
	assert(rows in ROW_OPTIONS, "层数必须是 8 / 12 / 16")
	assert(RISKS.has(risk), "未知档位")

	var directions: Array[int] = []
	var slot := 0
	for i in range(rows):
		var step := rng.randi_range(0, 1)
		directions.append(step)
		slot += step

	# 随机点亮几枚金钉
	var gold: Array[Vector2i] = []
	var seen := {}
	var guard := 0
	while gold.size() < mini(GOLD_PEGS, peg_count(rows)) and guard < 200:
		guard += 1
		var row := rng.randi_range(0, rows - 1)
		var col := rng.randi_range(0, row)
		var key := Vector2i(row, col)
		if not seen.has(key):
			seen[key] = true
			gold.append(key)

	# 球实际经过的列
	var columns: Array[int] = [0]
	var col_cursor := 0
	for step in directions:
		col_cursor += step
		columns.append(col_cursor)

	var gold_hits := 0
	for pair in gold:
		if pair.x < columns.size() and columns[pair.x] == pair.y:
			gold_hits += 1

	var table := paytable(rows, risk)
	var tenths := table[slot] + gold_hits * gold_bonus_tenths(rows)
	if charged:
		tenths *= CHARGED_MULTIPLIER

	return {
		"bet": bet,
		"risk": risk,
		"rows": rows,
		"charged": charged,
		"directions": directions,
		"gold": gold,
		"gold_hits": gold_hits,
		"slot": slot,
		"tenths": tenths,
		"multiplier": tenths / 10.0,
		"payout": bet * tenths / 10,
	}


## 球在 0~1 进度上的画布坐标，供表现层插值。
static func position_at(round_data: Dictionary, progress: float) -> Dictionary:
	var rows: int = round_data["rows"]
	var directions: Array = round_data["directions"]
	var clamped := clampf(progress, 0.0, 0.999)
	var exact := clamped * rows
	var row := int(floor(exact))
	var t := exact - row

	var col := 0
	for i in range(mini(row, directions.size())):
		col += directions[i]

	var from_x := peg_x(rows, row, col)
	var from_y := peg_y(rows, row)
	var next_col := col + (directions[row] if row < directions.size() else 0)
	var to_x := peg_x(rows, row + 1, next_col)
	var to_y := peg_y(rows, row + 1)

	return {
		"row": row,
		"col": col,
		"x": lerpf(from_x, to_x, t),
		"y": lerpf(from_y, to_y, t),
	}
