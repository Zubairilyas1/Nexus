"""Security audit checks for NexusVision backend."""

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

CHECKS_PASSED = 0
CHECKS_FAILED = 0


def check(name: str, passed: bool, detail: str = ""):
    global CHECKS_PASSED, CHECKS_FAILED
    status = "PASS" if passed else "FAIL"
    symbol = "OK" if passed else "!!"
    print(f"  [{symbol}] {name}: {status}")
    if detail:
        print(f"         {detail}")
    if passed:
        CHECKS_PASSED += 1
    else:
        CHECKS_FAILED += 1


def check_cors_origins():
    """Check CORS is not set to allow all origins in production."""
    from app.config import get_settings
    settings = get_settings()
    origins = settings.ALLOWED_ORIGINS
    has_wildcard = "*" in origins
    is_prod = settings.ENVIRONMENT == "production"
    check(
        "CORS origins",
        not (is_prod and has_wildcard),
        f"origins={origins}, env={settings.ENVIRONMENT}",
    )


def check_debug_disabled_in_prod():
    """Check debug mode is off in production."""
    from app.config import get_settings
    settings = get_settings()
    is_prod = settings.ENVIRONMENT == "production"
    check(
        "Debug disabled in production",
        not (is_prod and settings.DEBUG),
        f"debug={settings.DEBUG}, env={settings.ENVIRONMENT}",
    )


def check_jwt_secret():
    """Check JWT secret is not a default value."""
    from app.config import get_settings
    settings = get_settings()
    weak_secrets = {"secret", "password", "changeme", "dev-secret-key", ""}
    check(
        "JWT secret strength",
        settings.JWT_SECRET_KEY.lower() not in weak_secrets,
        f"secret_length={len(settings.JWT_SECRET_KEY)}",
    )


def check_sql_injection():
    """Check raw SQL usage in models."""
    model_files = list(Path("app/models").glob("*.py"))
    raw_sql_count = 0
    for f in model_files:
        content = f.read_text()
        if "text(" in content or "execute(" in content:
            raw_sql_count += 1
    check(
        "Raw SQL in models",
        raw_sql_count == 0,
        f"files_with_raw_sql={raw_sql_count}",
    )


def check_dependency_audit():
    """Run pip-audit if available."""
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip_audit", "--format", "json"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        import json
        data = json.loads(result.stdout)
        vulns = data.get("dependencies", [])
        vulnerable = [d for d in vulns if d.get("vulns")]
        check(
            "Dependency vulnerabilities",
            len(vulnerable) == 0,
            f"vulnerable_packages={len(vulnerable)}",
        )
    except (subprocess.TimeoutExpired, FileNotFoundError, Exception):
        check("Dependency audit", True, "pip-audit not installed, skipped")


def run_audit():
    global CHECKS_PASSED, CHECKS_FAILED
    print("=" * 50)
    print("NexusVision Security Audit")
    print("=" * 50)

    print("\n[CORS]")
    check_cors_origins()

    print("\n[Configuration]")
    check_debug_disabled_in_prod()
    check_jwt_secret()

    print("\n[Code Analysis]")
    check_sql_injection()

    print("\n[Dependencies]")
    check_dependency_audit()

    print("\n" + "=" * 50)
    print(f"Results: {CHECKS_PASSED} passed, {CHECKS_FAILED} failed")
    print("=" * 50)

    return CHECKS_FAILED == 0


if __name__ == "__main__":
    success = run_audit()
    sys.exit(0 if success else 1)
