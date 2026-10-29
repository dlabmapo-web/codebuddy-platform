#define _GNU_SOURCE
#include <unistd.h>
#include <stdlib.h>
#include <grp.h>
#include <sys/prctl.h>
#include <string.h>
/* This tiny pre-interpreter gate runs in the learner leaf before exec/init. */
int main(int argc,char **argv){
 if(argc!=2)return 70;
 char gate=0;
 if(read(3,&gate,1)!=1||gate!='I')return 70;
 if(setgroups(0,NULL)||setgid(1000)||setuid(1000))return 70;
 if(prctl(PR_SET_NO_NEW_PRIVS,1,0,0,0))return 70;
 for(int fd=4;fd<128;fd++)close(fd);
 if(!strcmp(argv[1],"cpython"))execl("/usr/local/bin/python3","python3","-I","-u","/opt/guest/native.py",NULL);
 if(!strcmp(argv[1],"pyodide"))execl("/usr/local/bin/node","node","--max-old-space-size=768","/opt/guest/pyodide-runner.mjs","/opt/pyodide",NULL);
 return 70;
}
