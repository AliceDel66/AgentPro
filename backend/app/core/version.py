APP_VERSION = "0.1.0"

# Increment this when the backend/frontend API contract changes in a way that
# old desktop builds cannot safely assume. Capabilities keep the check explicit
# instead of relying on version numbers alone.
API_CONTRACT_VERSION = 2
MIN_DESKTOP_CONTRACT_VERSION = 2

API_CAPABILITIES = [
    "runner.desktop-local.v1",
    "runner.artifact.delivery-manifest.v1",
    "review.delivery-manifest-payload.v1",
    "review.action-plan.v1",
]
