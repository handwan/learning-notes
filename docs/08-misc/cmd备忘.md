# cmd备忘
## tar解压缩命令
```bash
tar -zcvf archive.tar.gz dir/                      # 压缩
tar -zxvf archive.tar.gz                           # 解压

-z gzip
-c 压缩 create
-x 解压 extract
-v 显示过程 verbose
-f 指定文件名 file
```
## gpg加密命令
```bash
gpg -c archive.tar.gz                              # 加密
gpg -o archive.tar.gz -d archive.tar.gz.gpg        # 解密
tar -zcvf - dir/ | gpg -c -o archive.tar.gz.gpg    # 打包+加密
gpg -d archive.tar.gz.gpg | tar -zxvf -            # 解密+解压

-c 对称加密 symmetric
-d 解密 decrypt
- 标准输入输出
```