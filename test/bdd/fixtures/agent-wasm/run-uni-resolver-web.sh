#!/bin/sh
#
# Copyright SecureKey Technologies Inc. All Rights Reserved.
#
# SPDX-License-Identifier: Apache-2.0
#

cd /opt/uni-resolver-java/uni-resolver-web/
mvn --settings /opt/uni-resolver-java/settings.xml jetty:run
