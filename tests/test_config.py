import pytest

from backend.config import load_config


def _write(tmp_path, text):
    p = tmp_path / "config.yaml"
    p.write_text(text, encoding="utf-8")
    return str(p)


def test_loads_local_and_ssh(tmp_path):
    cfg = load_config(_write(tmp_path, """
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
    assert [i.name for i in cfg.instances] == ["local", "vps"]
    assert cfg.instances[1].transport == "ssh"


def test_missing_instances_raises(tmp_path):
    with pytest.raises(ValueError):
        load_config(_write(tmp_path, "refresh_seconds: 9\n"))


def test_ssh_without_key_raises(tmp_path):
    with pytest.raises(ValueError):
        load_config(_write(tmp_path, """
instances:
  - name: vps
    transport: ssh
    ssh: user@host
"""))
