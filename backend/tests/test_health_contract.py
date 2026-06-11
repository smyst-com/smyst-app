from app.main import app


def test_app_title() -> None:
    assert app.title == "Smyst API"

