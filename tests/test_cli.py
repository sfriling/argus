from backend.cli import main
from backend.settings import load


def _cfg(tmp_path):
    return str(tmp_path / "config.yaml")


def test_config_init_and_path(tmp_path, capsys):
    cfg = _cfg(tmp_path)
    assert main(["config", "init", "--config", cfg]) == 0
    assert (tmp_path / "config.yaml").is_file()
    # init refuses to clobber without --force
    assert main(["config", "init", "--config", cfg]) == 1
    assert main(["config", "init", "--config", cfg, "--force"]) == 0
    # path prints the resolved location
    capsys.readouterr()
    assert main(["config", "path", "--config", cfg]) == 0
    assert cfg in capsys.readouterr().out


def test_instance_add_list_remove(tmp_path, capsys):
    cfg = _cfg(tmp_path)
    main(["config", "init", "--config", cfg])

    assert main(["instance", "add", "--config", cfg, "--name", "box1",
                 "--transport", "local", "--hermes-home", "/h"]) == 0
    conf = load(cfg)
    assert any(i.name == "box1" for i in conf.instances)

    # duplicate name rejected
    assert main(["instance", "add", "--config", cfg, "--name", "box1"]) == 1

    # ssh without key rejected (validation)
    assert main(["instance", "add", "--config", cfg, "--name", "bad",
                 "--transport", "ssh", "--ssh", "u@h"]) == 1

    capsys.readouterr()
    assert main(["instance", "list", "--config", cfg]) == 0
    assert "box1" in capsys.readouterr().out

    assert main(["instance", "remove", "--config", cfg, "--name", "box1"]) == 0
    assert all(i.name != "box1" for i in load(cfg).instances)
    # removing a missing instance fails
    assert main(["instance", "remove", "--config", cfg, "--name", "ghost"]) == 1


def test_config_show(tmp_path, capsys):
    cfg = _cfg(tmp_path)
    main(["config", "init", "--config", cfg])
    capsys.readouterr()
    assert main(["config", "show", "--config", cfg]) == 0
    out = capsys.readouterr().out
    assert "Argus configuration" in out and "instances" in out


def test_doctor_local_reachable(tmp_path, capsys):
    cfg = _cfg(tmp_path)
    # a local instance pointing at an existing dir → reachable
    main(["instance", "add", "--config", cfg, "--name", "local",
          "--transport", "local", "--hermes-home", str(tmp_path)])
    rc = main(["doctor", "--config", cfg])
    out = capsys.readouterr().out
    assert "config valid" in out
    assert rc == 0
