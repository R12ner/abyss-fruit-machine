## 规则层测试。不依赖任何节点，所以能直接跑。
##
## 跑法：Godot 编辑器里打开本文件 → 「文件 → 运行」(Ctrl+Shift+X)，
## 或命令行 `godot --headless --script res://tests/test_plinko_rules.gd`
extends SceneTree

var _failures := 0


func _check(condition: bool, message: String) -> void:
	if not condition:
		_failures += 1
		push_error("FAIL: " + message)
		print("  ✗ ", message)


func _init() -> void:
	print("弹珠机规则测试")

	for rows in PlinkoRules.ROW_OPTIONS:
		for risk in PlinkoRules.RISK_KEYS:
			var table := PlinkoRules.paytable(rows, risk)

			_check(table.size() == rows + 1,
				"%d 层 %s 档应有 %d 个落点" % [rows, risk, rows + 1])

			# 左右对称
			for i in range(table.size()):
				_check(table[i] == table[table.size() - 1 - i],
					"%d 层 %s 档第 %d 槽必须与对侧相等" % [rows, risk, i])

			# 由边缘向中间单调不增
			var half := rows / 2
			for i in range(half):
				_check(table[i] >= table[i + 1],
					"%d 层 %s 档第 %d 槽不该比内侧低" % [rows, risk, i])

			# 返还率落在目标附近
			var probs := PlinkoRules.slot_probabilities(rows)
			var rtp := 0.0
			for i in range(table.size()):
				rtp += table[i] * probs[i]
			rtp /= 10.0
			_check(abs(rtp - PlinkoRules.BASE_RTP) < 0.02,
				"%d 层 %s 档返还率 %.3f 偏离目标 %.2f" % [rows, risk, rtp, PlinkoRules.BASE_RTP])

	# 结算必须是整数：投注额是 10 的倍数、赔付以十分之一倍存储
	var rng := RandomNumberGenerator.new()
	rng.seed = 12345
	for i in range(200):
		var bet: int = PlinkoRules.STAKES[rng.randi_range(0, PlinkoRules.STAKES.size() - 1)]
		var rows: int = PlinkoRules.ROW_OPTIONS[rng.randi_range(0, 2)]
		var risk: String = PlinkoRules.RISK_KEYS[rng.randi_range(0, 3)]
		var result := PlinkoRules.create_round(bet, risk, rows, i % 7 == 0, rng)
		_check(result["payout"] == bet * result["tenths"] / 10,
			"结算必须是整数 USD")
		_check(result["slot"] >= 0 and result["slot"] <= rows,
			"落点必须落在盘面内")
		_check(result["gold_hits"] <= PlinkoRules.GOLD_PEGS,
			"金钉命中数不能超过金钉总数")

	# 同一个种子必须复现同一局
	var a := RandomNumberGenerator.new(); a.seed = 777
	var b := RandomNumberGenerator.new(); b.seed = 777
	var left := PlinkoRules.create_round(10, "classic", 12, false, a)
	var right := PlinkoRules.create_round(10, "classic", 12, false, b)
	_check(left["directions"] == right["directions"], "同种子必须走同一条路径")
	_check(left["payout"] == right["payout"], "同种子必须给同样的赔付")

	if _failures == 0:
		print("全部通过")
	else:
		print("失败 %d 项" % _failures)
	quit(1 if _failures > 0 else 0)
