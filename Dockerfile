FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code and frontend
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY run.py .

EXPOSE 8000

CMD ["python", "run.py"]
