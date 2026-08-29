#!/usr/bin/env bash
set -e

gh auth switch --user guelfi
git remote -v
git fetch origin
git status
