# ============================================================
#  karel_runtime.py  —  Python-in-the-browser layer (Brython)
# ------------------------------------------------------------
#  This file is executed by Brython at page load. It defines the
#  Karel command vocabulary in *real* Python and exposes a single
#  entry point, `runKarelCode`, to the JavaScript world.
#
#  The commands here are thin wrappers: they delegate to the
#  JavaScript `window.KarelEngine`, which owns the logical grid
#  state and records an animation timeline. Python runs the user's
#  logic synchronously; JavaScript replays the animation afterward.
# ============================================================

from browser import document, window


# ---- Safety guard ------------------------------------------------
# Every command ticks an operation counter on the engine. If a user
# writes an unbounded loop (e.g. `while True: turn_left()`), the
# engine returns True from tick() once the cap is exceeded and we
# raise, instead of freezing the browser tab.
def _guard():
    if window.KarelEngine.tick():
        raise RuntimeError("Operation limit exceeded — possible infinite loop.")


# ---- Karel actions ----------------------------------------------
def move():
    """Advance Karel one cell in the direction it is facing."""
    _guard()
    if not window.KarelEngine.tryMove():
        raise RuntimeError("Karel crashed: the path ahead is blocked.")


def turn_left():
    """Rotate Karel 90 degrees counter-clockwise."""
    _guard()
    window.KarelEngine.turnLeft()


def put_beeper():
    """Drop a beeper on Karel's current cell."""
    _guard()
    window.KarelEngine.putBeeper()


def pick_beeper():
    """Pick up a beeper from Karel's current cell."""
    _guard()
    if not window.KarelEngine.pickBeeper():
        raise RuntimeError("There is no beeper here to pick up.")


# ---- Karel predicates (for if / while conditions) ---------------
def front_is_clear():
    """True if Karel can move forward without crashing."""
    return bool(window.KarelEngine.frontIsClear())


def front_is_blocked():
    return not front_is_clear()


def beepers_present():
    """True if Karel is standing on a cell that holds a beeper."""
    return bool(window.KarelEngine.beepersPresent())


def no_beepers_present():
    return not beepers_present()


# ---- Entry point exposed to JavaScript --------------------------
def run_user_code(*args):
    """Read the editor contents and execute them as Python.

    The Karel vocabulary is injected as the global namespace so the
    user can call move(), turn_left(), use for/while/if/def, etc.
    """
    code = document["code-editor"].value

    env = {
        "move": move,
        "turn_left": turn_left,
        "put_beeper": put_beeper,
        "pick_beeper": pick_beeper,
        "front_is_clear": front_is_clear,
        "front_is_blocked": front_is_blocked,
        "beepers_present": beepers_present,
        "no_beepers_present": no_beepers_present,
        "range": range,
        "len": len,
        "print": lambda *a: window.KarelEngine.logInfo(" ".join(str(x) for x in a)),
    }

    try:
        exec(code, env)
        window.KarelEngine.finish(True)
    except Exception as e:        # surface Python errors in the console
        window.KarelEngine.crash(str(e))
        window.KarelEngine.finish(False)


# Make run_user_code callable from JavaScript as window.runKarelCode()
window.runKarelCode = run_user_code

# Signal to the JS layer that the Python runtime is live.
window.KarelPythonReady = True
