"""Argus command-line interface — manage config and run the server.

    argus serve [--host H --port P --config PATH]
    argus config init|path|show [--config PATH] [--force]
    argus instance add|remove|list [...]
    argus doctor [--config PATH]

All commands go through backend.settings (the shared config core)."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from backend import settings
from backend.settings import AppConfig, Instance, resolve_config_path

STARTER_YAML = """\
# Argus configuration. Docs: README.md
host: 127.0.0.1        # bind address; keep on localhost if enable_config_writes is true
port: 7700
refresh_seconds: 5
claude_home: "~/.claude"   # local Claude Code home for the Claude Agents panel; "" disables
enable_config_writes: false  # set true (and stay on localhost) to edit settings from the UI

instances:
  - name: local
    transport: local
    profile: orchestrator
    hermes_home: "~/.hermes"
    hermes_bin: "hermes"
  # - name: vps
  #   transport: ssh
  #   profile: orchestrator
  #   ssh: "user@your.vps.ip"
  #   ssh_key: "~/.ssh/your_key"
  #   hermes_home: "/home/user/.hermes"
  #   hermes_bin: "/home/user/.hermes/hermes-agent/venv/bin/hermes"
"""


def _err(msg: str) -> int:
    print(f"argus: {msg}", file=sys.stderr)
    return 1


# --- serve -------------------------------------------------------------------

def cmd_serve(args) -> int:
    if args.config:
        os.environ["ARGUS_CONFIG"] = args.config
    try:
        config = settings.load(args.config)
    except FileNotFoundError as e:
        return _err(f"{e}")
    except ValueError as e:
        return _err(f"invalid config: {e}")

    host = args.host or config.host
    port = args.port or config.port
    # Let the write-guard see the real bound host (honours a --host override).
    os.environ["ARGUS_BIND_HOST"] = host

    import uvicorn
    print(f"Argus serving on http://{host}:{port}  (config: {resolve_config_path(args.config)})")
    uvicorn.run("backend.app:create_app", factory=True, host=host, port=port, log_level="info")
    return 0


# --- config ------------------------------------------------------------------

def cmd_config_init(args) -> int:
    path = resolve_config_path(args.config)
    if path.exists() and not args.force:
        return _err(f"{path} already exists (use --force to overwrite)")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(STARTER_YAML, encoding="utf-8")
    print(f"Wrote starter config to {path}")
    print("Edit it (or use `argus instance add`), then run `argus serve`.")
    return 0


def cmd_config_path(args) -> int:
    print(resolve_config_path(args.config))
    return 0


def cmd_config_show(args) -> int:
    try:
        config = settings.load(args.config)
    except (FileNotFoundError, ValueError) as e:
        return _err(f"{e}")
    print(settings.to_yaml(config))
    return 0


# --- instance ----------------------------------------------------------------

def cmd_instance_list(args) -> int:
    try:
        config = settings.load(args.config)
    except (FileNotFoundError, ValueError) as e:
        return _err(f"{e}")
    if not config.instances:
        print("(no instances configured)")
        return 0
    for i in config.instances:
        where = i.ssh if i.transport == "ssh" else i.hermes_home or "(local)"
        print(f"{i.name:16} {i.transport:6} {i.profile:14} {where}")
    return 0


def cmd_instance_add(args) -> int:
    try:
        config = settings.load(args.config)
    except FileNotFoundError:
        config = AppConfig()
    except ValueError as e:
        return _err(f"{e}")
    if any(i.name == args.name for i in config.instances):
        return _err(f"instance {args.name!r} already exists")
    try:
        inst = Instance(
            name=args.name, transport=args.transport, profile=args.profile,
            hermes_home=args.hermes_home or "", hermes_bin=args.hermes_bin or "hermes",
            ssh=args.ssh, ssh_key=args.ssh_key, reliability_log=args.reliability_log,
        )
    except ValueError as e:
        return _err(f"invalid instance: {e}")
    config.instances.append(inst)
    p = settings.save(config, args.config)
    print(f"Added instance {args.name!r} -> {p}")
    return 0


def cmd_instance_remove(args) -> int:
    try:
        config = settings.load(args.config)
    except (FileNotFoundError, ValueError) as e:
        return _err(f"{e}")
    before = len(config.instances)
    config.instances = [i for i in config.instances if i.name != args.name]
    if len(config.instances) == before:
        return _err(f"no instance named {args.name!r}")
    p = settings.save(config, args.config)
    print(f"Removed instance {args.name!r} -> {p}")
    return 0


# --- doctor ------------------------------------------------------------------

def cmd_doctor(args) -> int:
    path = resolve_config_path(args.config)
    print(f"config: {path}")
    try:
        config = settings.load(args.config)
    except (FileNotFoundError, ValueError) as e:
        print(f"  [!!] {e}")
        return 1
    print("  [ok] config valid")

    home = config.claude_home_path
    if home:
        ok = Path(home).exists()
        print(f"  {'[ok]' if ok else '[!!]'} claude_home {home} {'' if ok else '(missing - panel will be empty)'}")

    from backend.transport import make_runner
    all_ok = True
    for i in config.instances:
        print(f"  - {i.name} ({i.transport}):")
        if i.transport == "ssh" and i.ssh_key:
            key_ok = Path(os.path.expanduser(i.ssh_key)).exists()
            all_ok = all_ok and key_ok
            print(f"      {'[ok]' if key_ok else '[!!]'} ssh key {i.ssh_key}")
        try:
            runner = make_runner(i)
            reachable = (not i.hermes_home) or runner.exists(i.hermes_home, timeout=8)
        except Exception as e:
            reachable = False
            print(f"      [!!] runner error: {e}")
        print(f"      {'[ok]' if reachable else '[!!]'} hermes_home reachable")
        all_ok = all_ok and reachable
    print("doctor:", "all checks passed" if all_ok else "some checks failed")
    return 0 if all_ok else 1


# --- parser ------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="argus", description="Argus - Hermes fleet dashboard")
    sub = p.add_subparsers(dest="command", required=True)

    def add_config_flag(sp):
        sp.add_argument("--config", help="path to config.yaml (overrides discovery)")

    s = sub.add_parser("serve", help="run the dashboard server")
    s.add_argument("--host"); s.add_argument("--port", type=int); add_config_flag(s)
    s.set_defaults(func=cmd_serve)

    c = sub.add_parser("config", help="manage the config file")
    csub = c.add_subparsers(dest="config_command", required=True)
    ci = csub.add_parser("init", help="write a starter config"); add_config_flag(ci)
    ci.add_argument("--force", action="store_true"); ci.set_defaults(func=cmd_config_init)
    cp = csub.add_parser("path", help="print the resolved config path"); add_config_flag(cp)
    cp.set_defaults(func=cmd_config_path)
    cs = csub.add_parser("show", help="print the loaded config"); add_config_flag(cs)
    cs.set_defaults(func=cmd_config_show)

    ins = sub.add_parser("instance", help="manage instances")
    isub = ins.add_subparsers(dest="instance_command", required=True)
    il = isub.add_parser("list"); add_config_flag(il); il.set_defaults(func=cmd_instance_list)
    ia = isub.add_parser("add")
    ia.add_argument("--name", required=True)
    ia.add_argument("--transport", default="local", choices=["local", "ssh"])
    ia.add_argument("--profile", default="orchestrator")
    ia.add_argument("--hermes-home", dest="hermes_home")
    ia.add_argument("--hermes-bin", dest="hermes_bin")
    ia.add_argument("--ssh"); ia.add_argument("--ssh-key", dest="ssh_key")
    ia.add_argument("--reliability-log", dest="reliability_log")
    add_config_flag(ia); ia.set_defaults(func=cmd_instance_add)
    ir = isub.add_parser("remove"); ir.add_argument("--name", required=True)
    add_config_flag(ir); ir.set_defaults(func=cmd_instance_remove)

    d = sub.add_parser("doctor", help="validate config and probe instances")
    add_config_flag(d); d.set_defaults(func=cmd_doctor)
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
