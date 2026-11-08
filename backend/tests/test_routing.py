import time

from routing import RouteManager, dist_m, dist_to_route_m, simplify

BENGALURU = {"lat": 12.9716, "lng": 77.5946}
MYSURU = {"lat": 12.2958, "lng": 76.6394}
ROUTE = [[12.0, 77.0], [12.0, 77.1]]  # [lat, lng] pairs: a straight line going east
DEST = {"lat": 12.0, "lng": 77.1}
ON_ROUTE = {"lat": 12.0, "lng": 77.05}
OFF_ROUTE = {"lat": 12.01, "lng": 77.05}  # about 1.1 km north of the route


def test_distance_between_two_cities():
    assert 120_000 < dist_m(BENGALURU, MYSURU) < 136_000


def test_distance_to_itself_is_zero():
    assert dist_m(BENGALURU, BENGALURU) == 0


def test_point_on_the_route():
    assert dist_to_route_m(ON_ROUTE, ROUTE) < 1


def test_point_beside_the_route():
    assert 100 < dist_to_route_m({"lat": 12.001, "lng": 77.05}, ROUTE) < 125


def test_simplify_drops_points_on_a_straight_line():
    line = [[0.0, 0.0], [0.0, 0.001], [0.0, 0.002], [0.0, 0.003]]
    assert simplify(line) == [[0.0, 0.0], [0.0, 0.003]]


def test_simplify_keeps_corners():
    corner = [[0.0, 0.0], [0.0, 0.01], [0.01, 0.01]]
    assert simplify(corner) == corner


def manager(age_s=None, arrived=False):
    mgr = RouteManager(emit=lambda code, msg: None, get_location=lambda code, mid: None)
    if age_s is not None:
        mgr.fetched_at[("T", "m")] = time.time() - age_s
        mgr.routes["T"] = {
            "m": {"coords": ROUTE, "distance_m": 5000, "duration_s": 400, "arrived": arrived}
        }
    return mgr


def needs(mgr, loc):
    return mgr._needs_refresh("T", "m", loc, DEST)


def test_first_route_is_fetched():
    assert needs(manager(), ON_ROUTE) is True


def test_no_refetch_within_the_minimum_gap():
    mgr = manager()
    mgr.fetched_at[("T", "m")] = time.time() - 5
    assert needs(mgr, ON_ROUTE) is False


def test_on_route_and_recent_means_no_refresh():
    assert needs(manager(age_s=40), ON_ROUTE) is False


def test_old_route_is_refreshed():
    assert needs(manager(age_s=100), ON_ROUTE) is True


def test_drifting_off_route_triggers_a_refresh():
    assert needs(manager(age_s=40), OFF_ROUTE) is True


def test_drifting_off_route_still_respects_the_minimum_gap():
    assert needs(manager(age_s=10), OFF_ROUTE) is False


def test_arrived_stays_quiet_until_they_move_away():
    mgr = manager(age_s=40, arrived=True)
    assert needs(mgr, DEST) is False
    assert needs(mgr, OFF_ROUTE) is True
