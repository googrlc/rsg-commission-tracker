"""Keep sync-tool duplicates out of the test run.

A file-sync path drops byte-identical copies next to originals ("router 2.py").
A duplicate is a FROZEN copy: edit the original and the twin keeps asserting the
old behaviour, so the suite stays green while disagreeing with itself. This repo
already carries several committed ones (Dockerfile 2, package 2.json).
"""

collect_ignore_glob = ["* [0-9].py", "**/* [0-9].py"]
