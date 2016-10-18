import rp from 'request-promise-native';

const api = {};

async function requestAsync(actionUrl, options = {}) {
  let resp;
  try {
    resp = await rp({
      simple: false,
      resolveWithFullResponse: true,
      url: `${DI.config.api.url}${actionUrl}`,
      auth: {
        user: DI.config.api.credential.username,
        pass: DI.config.api.credential.password,
      },
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
      },
      ...options,
    });
    return resp;
  } catch (err) {
    throw new Error(`Failed to connect to Portal API service: ${err.message}`);
  }
}

async function requestJsonAsync(actionUrl, options = {}) {
  const resp = await requestAsync(actionUrl, {
    json: true,
    gzip: true,
    ...options,
  });
  const { body } = resp;
  if (body.err) {
    throw new Error(`Portal API request failed: ${body.name}: ${body.msg}`);
  }
  return body;
}

async function requestBinaryAsync(actionUrl, options = {}) {
  const resp = await requestAsync(actionUrl, {
    encoding: null,
    ...options,
  });
  if (resp.statusCode !== 200) {
    let body;
    try {
      body = JSON.parse(resp.body.toString());
    } catch (err) {
      throw new Error('Portal API request failed: Cannot decode error message from server');
    }
    throw new Error(`Portal API request failed: ${body.name}: ${body.msg}`);
  }
  return resp.body;
}

api.compileBegin = (id, token) => {
  return requestJsonAsync('/submission/api/compileBegin', {
    method: 'POST',
    body: { id, token },
  });
};

api.compileEnd = (id, token, text, success, lzmaBuffer) => {
  const body = {
    id,
    token,
    text,
    success: String(success),
  };
  if (success && lzmaBuffer) {
    body.binary = {
      value: lzmaBuffer,
      options: {
        filename: id,
        contentType: 'application/x-xz',
      },
    };
  }
  return requestJsonAsync('/submission/api/compileEnd', {
    method: 'POST',
    formData: body,
  });
};

api.compileError = (id, token, text) => {
  return requestJsonAsync('/submission/api/compileError', {
    method: 'POST',
    body: { id, token, text },
  });
};

api.getSubmissionBinary = (id) => {
  return requestBinaryAsync('/submission/api/binary', {
    qs: { id },
    method: 'GET',
  });
};

api.roundBegin = (mid, rid) => {
  return requestJsonAsync('/match/api/roundBegin', {
    method: 'POST',
    body: { mid, rid },
  });
};

api.roundError = (mid, rid, text) => {
  return requestJsonAsync('/match/api/roundError', {
    method: 'POST',
    body: { mid, rid, text },
  });
};

api.roundComplete = (mid, rid, exitCode, logBuffer) => {
  const body = {
    mid,
    rid,
    exitCode: String(exitCode),
    log: {
      value: logBuffer,
      options: {
        filename: rid,
        contentType: 'text/plain',
      },
    },
  };
  return requestJsonAsync('/match/api/roundComplete', {
    method: 'POST',
    formData: body,
  });
};

export default api;
