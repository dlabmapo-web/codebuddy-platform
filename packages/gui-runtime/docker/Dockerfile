FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-tk xvfb x11vnc socat fonts-dejavu-core && rm -rf /var/lib/apt/lists/* && useradd -o -u 1000 -m learner
COPY boot.sh run.py assets.py /opt/
RUN chmod 555 /opt/boot.sh /opt/run.py
USER 1000:1000
ENV DISPLAY=:99 HOME=/tmp
WORKDIR /work
ENTRYPOINT ["/opt/boot.sh"]
