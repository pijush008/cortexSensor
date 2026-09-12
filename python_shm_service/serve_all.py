"""
Runs the HTTP and gRPC faces in one process.

Both are kept alive on purpose. gRPC is the fast path the API tier uses; the
HTTP face remains for the compose health check, for curl-level debugging, and
so that falling back is an environment variable rather than a redeploy.
"""

import logging
import os

import uvicorn

from grpc_server import serve

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    # Non-blocking: gRPC gets its own threads, then uvicorn owns the main one.
    #
    # The reference MUST be held. grpc.Server stops serving when it is garbage
    # collected, so discarding the return value starts a server that listens
    # just long enough to log that it is listening and then quietly dies —
    # which is exactly what happened here, leaving a port that logs success and
    # refuses connections.
    grpc_server = serve(block=False)
    assert grpc_server is not None
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8000")),
        log_level="info",
    )
