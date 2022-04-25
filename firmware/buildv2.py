#!/usr/bin/env python3

# MIT License
# 
# Copyright (c) 2019 Micro:bit Educational Foundation
# 
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:

# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.

# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.

import os
import stat
import shutil
import subprocess

################################################################
# FILE UTILS

def fileutils_rmtree(path):
    if os.path.exists(path):
        for root, dirs, files in os.walk(path, topdown=False):
            for name in files:
                filename = os.path.join(root, name)
                os.chmod(filename, stat.S_IWRITE)
                os.remove(filename)
            for name in dirs:
                os.rmdir(os.path.join(root, name))
        os.rmdir(path)      


def fileutils_remove(path):
    if os.path.exists(path):
        os.remove(path)


def fileutils_rename(src,dst):
    if os.path.exists(src):
        os.rename(src,dst)


def fileutils_copytree(src,dst):
    if os.path.exists(src):
        shutil.copytree(src,dst)

################################################################
# Build in sibling folder microbit-v2-samples:
#   replace microbit-v2-samples/source with our source folder
#   change to microbit-v2-samples and run build.py
#   restore microbit-v2-samples/source

V2ROOT="../microbit-v2-samples"
V2SOURCE="../microbit-v2-samples/source"
V2NOTSOURCE="../microbit-v2-samples/notsource"

SOURCE="./source"
BACK="../firmware"

# rename default source folder out of the way

fileutils_rmtree(V2NOTSOURCE)
fileutils_rename(V2SOURCE, V2NOTSOURCE)

# copy our source folder into place

fileutils_copytree(SOURCE, V2SOURCE);

# change directory and run the build

os.chdir(V2ROOT)
subprocess.call(["python3", "build.py"])
os.chdir(BACK)

#restore original source folder

fileutils_rmtree(V2SOURCE)
fileutils_rename(V2NOTSOURCE, V2SOURCE)
