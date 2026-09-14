## 跨机台共享钱包（autoload）。
## 对应网页版的 casino/wallet.mjs —— 所有机台只通过这三个方法动钱，
## 谁都不许直接改别人的余额。
extends Node

signal balance_changed(balance: int)

const STARTING_BALANCE := 100

var _balance := STARTING_BALANCE


func balance() -> int:
	return _balance


## 扣钱。余额不足返回 0，不会扣一半。
func spend(amount: int) -> int:
	if amount <= 0 or amount > _balance:
		return 0
	_balance -= amount
	balance_changed.emit(_balance)
	return amount


func deposit(amount: int) -> int:
	if amount <= 0:
		return 0
	_balance += amount
	balance_changed.emit(_balance)
	return amount
