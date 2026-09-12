#!/bin/sh
# Generate the gRPC stubs from the shared .proto at start-up, then run both
# faces. Generated code is deliberately NOT committed: it must never drift from
# the contract, and regenerating costs under a second.
set -e
python -m grpc_tools.protoc \
  -I/proto \
  --python_out=/app/proto \
  --grpc_python_out=/app/proto \
  /proto/shm/engine/v1/engine.proto

# protoc writes nested packages; flatten to `proto.engine_pb2` so the import in
# grpc_server.py stays readable, and fix the cross-import it generates.
mv /app/proto/shm/engine/v1/engine_pb2.py /app/proto/engine_pb2.py
mv /app/proto/shm/engine/v1/engine_pb2_grpc.py /app/proto/engine_pb2_grpc.py
# protoc emits `from shm.engine.v1 import engine_pb2`, which cannot resolve once
# the file is flattened into the `proto` package. A relative import can.
sed -i 's/^from shm\.engine\.v1 import engine_pb2/from . import engine_pb2/' /app/proto/engine_pb2_grpc.py
rm -rf /app/proto/shm

exec python -m serve_all
