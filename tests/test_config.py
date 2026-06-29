import pytest

from backend.settings import (
    AppConfig,
    config_writable,
    load,
    resolve_config_path,
    save,
    to_yaml,
)


def _write(tmp_path, text):
    p = tmp_path / "config.yaml"
    p.write_text(text, encoding="utf-8")
    return str(p)


def test_loads_local_and_ssh(tmp_path):
    cfg = load(_write(tmp_path, """
instances:
  - name: local
    transport: local
    hermes_home: /h
    hermes_bin: hermes
  - name: vps
    transport: ssh
    ssh: user@host
    ssh_key: /k
    hermes_home: /home/u/.hermes
"""))
    assert cfg.refresh_seconds == 5  # default
    assert cfg.host == "127.0.0.1" and cfg.port == 7700  # defaults
    assert [i.name for i in cfg.instances] == ["local", "vps"]
    assert cfg.instances[1].transport == "ssh"


def test_empty_instances_is_valid(tmp_path):
    # A fresh config (init then `instance add`) legitimately has no instances.
    cfg = load(_write(tmp_path, "refresh_seconds: 9\n"))
    assert cfg.instances == []
    assert cfg.refresh_seconds == 9


def test_ssh_without_key_raises(tmp_path):
    with pytest.raises(ValueError):
        load(_write(tmp_path, """
instances:
  - name: vps
    transport: ssh
    ssh: user@host
"""))


def test_bad_transport_raises(tmp_path):
    with pytest.raises(ValueError):
        load(_write(tmp_path, """
instances:
  - name: x
    transport: carrier-pigeon
"""))


def test_save_load_round_trip(tmp_path):
    cfg = AppConfig(
        port=8800,
        enable_config_writes=True,
        instances=[{"name": "local", "transport": "local", "hermes_home": "/h"}],
    )
    p = tmp_path / "out.yaml"
    save(cfg, str(p))
    again = load(str(p))
    assert again.port == 8800
    assert again.enable_config_writes is True
    assert again.instances[0].name == "local"
    # local instance must not carry null ssh keys in the file
    assert "ssh:" not in p.read_text(encoding="utf-8")


def test_to_yaml_has_header(tmp_path):
    text = to_yaml(AppConfig())
    assert text.startswith("# Argus configuration")


def test_resolve_path_precedence(tmp_path, monkeypatch):
    explicit = tmp_path / "explicit.yaml"
    monkeypatch.setenv("ARGUS_CONFIG", str(tmp_path / "env.yaml"))
    # explicit arg wins over env
    assert resolve_config_path(str(explicit)) == explicit
    # env wins when no explicit arg (and no repo-local config.yaml in cwd)
    monkeypatch.chdir(tmp_path)
    assert resolve_config_path() == tmp_path / "env.yaml"


def test_config_writable_guard():
    on_local = AppConfig(enable_config_writes=True, host="127.0.0.1")
    assert config_writable(on_local) is True
    assert config_writable(on_local, bind_host="0.0.0.0") is False     # exposed → no writes
    off = AppConfig(enable_config_writes=False, host="127.0.0.1")
    assert config_writable(off) is False                               # not enabled → no writes
