#!/bin/sh
# Generate the gRPC stubs from the shared .proto at start-up, then run both
# faces. The generation itself lives in generate_proto.sh so that CI, which has
# no /proto mount, can perform exactly the same steps against its checkout.
set -e

"$(dirname "$0")/generate_proto.sh"

exec python -m serve_all
