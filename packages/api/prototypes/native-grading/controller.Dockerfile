ARG DOCKER_CLI_IMAGE
ARG JUDGE_IMAGE
FROM ${DOCKER_CLI_IMAGE} AS cli
FROM ${JUDGE_IMAGE}
LABEL cove.native.prototype.controller="true"
COPY --from=cli /usr/local/bin/docker /usr/local/bin/docker
COPY native-pool.mjs docker-driver.mjs controller.mjs seccomp.json budget.mjs /prototype/
WORKDIR /app
USER 0:0
ENTRYPOINT ["node", "/prototype/controller.mjs"]
