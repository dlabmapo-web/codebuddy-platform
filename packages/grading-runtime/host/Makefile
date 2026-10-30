CC = gcc
CPPFLAGS = -I. -Ivendor/mbedtls/include -DMBEDTLS_CONFIG_FILE='"mbedtls_config.h"'
CFLAGS = -std=c11 -O2 -fPIE -Wall -Wextra -Werror -fstack-protector-strong -D_FORTIFY_SOURCE=3
LDFLAGS = -static-pie -Wl,-z,relro,-z,now,-z,noexecstack
COMMON = config.c identity.c protocol.c policy.c vendor/mbedtls/library/sha256.c vendor/mbedtls/library/platform_util.c
.PHONY: all clean manifest
all: bin/attestor bin/attestor-client
bin:
	mkdir -p bin
bin/attestor: attestor.c $(COMMON) common.h mbedtls_config.h | bin
	$(CC) $(CPPFLAGS) $(CFLAGS) $< $(COMMON) $(LDFLAGS) -o $@
bin/attestor-client: attestor-client.c $(COMMON) common.h mbedtls_config.h | bin
	$(CC) $(CPPFLAGS) $(CFLAGS) $< $(COMMON) $(LDFLAGS) -o $@
bin/fixtures: fixtures.c $(COMMON) common.h mbedtls_config.h | bin
	$(CC) $(CPPFLAGS) $(CFLAGS) $< $(COMMON) $(LDFLAGS) -o $@
manifest: all
	python3 build_manifest.py
clean:
	rm -rf bin
