ARG PYTHON_IMAGE
FROM ${PYTHON_IMAGE}
LABEL cove.native.prototype.guest="true"
COPY learner.py supervisor.py /opt/native/
RUN python3 -m compileall -q /opt/native && chmod -R a-w /opt/native
WORKDIR /tmp
ENTRYPOINT ["python3", "-I", "-S", "-u", "/opt/native/supervisor.py"]
