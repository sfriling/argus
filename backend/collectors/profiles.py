from __future__ import annotations


def collect_profiles(runner, instance) -> tuple[str, list[str]]:
    home = instance.hermes_home.rstrip("/\\")
    active = (runner.read(home + "/active_profile") or "").strip()
    profiles = runner.list_dir(home + "/profiles")
    return active, profiles
