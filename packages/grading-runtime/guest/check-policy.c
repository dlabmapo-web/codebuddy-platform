/* Compile both supported architectures with exactly the pinned Kafel submodule. */
#include <linux/filter.h>
#include <stdio.h>
#include <stdlib.h>
#include <kafel.h>
int main(int argc, char **argv) {
  if (argc != 3) return 2;
  const unsigned int architectures[] = {KAFEL_TARGET_ARCH_X86_64, KAFEL_TARGET_ARCH_AARCH64};
  for (unsigned int i = 0; i < 2; i++) {
    FILE *file = fopen(argv[i + 1], "r");
    if (!file) return 2;
    kafel_ctxt_t context = kafel_ctxt_create();
    kafel_set_input_file(context, file);
    kafel_set_target_archs(context, architectures[i]);
    struct sock_fprog program = {0};
    if (kafel_compile(context, &program)) {
      fprintf(stderr, "arch=%u: %s\n", architectures[i], kafel_error_msg(context));
      return 1;
    }
    printf("arch=%u: %u BPF instructions\n", architectures[i], program.len);
    free(program.filter);
    kafel_ctxt_destroy(&context);
    fclose(file);
  }
  return 0;
}
