#!/bin/sh
# Generate the gRPC stubs from the shared .proto.
#
# Generated code is deliberately NOT committed: it must never drift from the
# contract, and regenerating costs under a second.
#
# The paths are configurable because this runs in two places. In the container,
# compose mounts the contract at /proto and the service at /app. In CI there is
# no mount — both are just directories in the checkout. Keeping ONE copy of the
# flattening below is the whole point of this file; a second copy inlined in a
# workflow would drift from this one the first time the contract moved.
set -e

PROTO_DIR="${PROTO_DIR:-/proto}"
APP_DIR="${APP_DIR:-/app}"

python -m grpc_tools.protoc \
  -I"$PROTO_DIR" \
  --python_out="$APP_DIR/proto" \
  --grpc_python_out="$APP_DIR/proto" \
  "$PROTO_DIR/shm/engine/v1/engine.proto"

# protoc writes nested packages; flatten to `proto.engine_pb2` so the import in
# grpc_server.py stays readable, and fix the cross-import it generates.
mv "$APP_DIR/proto/shm/engine/v1/engine_pb2.py" "$APP_DIR/proto/engine_pb2.py"
mv "$APP_DIR/proto/shm/engine/v1/engine_pb2_grpc.py" "$APP_DIR/proto/engine_pb2_grpc.py"
# protoc emits `from shm.engine.v1 import engine_pb2`, which cannot resolve once
# the file is flattened into the `proto` package. A relative import can.
sed -i 's/^from shm\.engine\.v1 import engine_pb2/from . import engine_pb2/' \
  "$APP_DIR/proto/engine_pb2_grpc.py"
rm -rf "$APP_DIR/proto/shm"
