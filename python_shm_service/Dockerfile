FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . /app
# 8000 HTTP (health, debugging, fallback), 50051 gRPC (the path the API uses).
EXPOSE 8000 50051
ENTRYPOINT ["/app/entrypoint.sh"]
