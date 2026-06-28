from backend.models import InstanceOverview, Overview


def test_instance_overview_defaults_are_safe():
    io = InstanceOverview(name="x", transport="local")
    assert io.reachable is True
    assert io.error is None
    assert io.gateway.up is False
    assert io.dispatcher.running is False
    assert io.kanban.counts == {}
    assert io.kanban.in_flight == []
    assert io.crons == []
    assert io.reliability.today.catches == 0
    assert io.reliability.recent == []
    assert io.panel_errors == []


def test_overview_round_trips_to_dict():
    ov = Overview(generated_at="t", refresh_seconds=5, instances=[InstanceOverview(name="x", transport="ssh")])
    d = ov.model_dump()
    assert d["refresh_seconds"] == 5
    assert d["instances"][0]["transport"] == "ssh"
