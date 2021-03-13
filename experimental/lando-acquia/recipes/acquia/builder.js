'use strict';

const _ = require('lodash');
const {getAcquiaPull} = require('./../../lib/pull');
// const {getAcquiaPush} = require('./../../lib/push');
const utils = require('./../../lib/utils');

module.exports = {
  name: 'acquia',
  parent: '_drupaly',
  config: {
    confSrc: __dirname,
    defaultFiles: {},
    php: '7.4',
    drush: '^10',
    services: {appserver: {
      build: [],
      overrides: {volumes: [], environment: {}},
    }},
  },
  builder: (parent, config) => class LandoAcquia extends parent {
    constructor(id, options = {}) {
      options = _.merge({}, config, options);
      options.drush = false;
      options.database = 'mysql:5.7';
      // Load .env file.
      options.env_file = ['.env'];
      options.webroot = 'docroot';

      // Get and discover our keys
      const keys = utils.sortKeys(options._app.acquiaKeys, options._app.hostKeys);
      // Try to grab other relevant stuff that we might have saved
      const key = _.get(options, '_app.meta.key', null);
      const secret = _.get(options, '_app.meta.secret', null);
      const account = _.get(options, '_app.meta.label', null);
      const group = _.get(options, '_app.config.config.ah_site_group', null);
      const appUuid = _.get(options, '_app.config.config.ah_application_uuid', null);
      const acliVersion = _.get(options, '_app.config.config.acli_version', 'master');

      // Figure out our ACLI situation first
      // Install acli from either 1) latest download, 2) A specific version, or 3) build from a branch
      // TODO: switch default to `latest` once acli catches up.
      const regexVersion = /^[0-9]+\.[0-9]+\.[0-9]+$/g;
      let acliDownload = null;
      if (acliVersion === 'latest') {
        acliDownload = 'https://github.com/acquia/cli/releases/latest/download/acli.phar';
      } else if (acliVersion.match(regexVersion)) {
        acliDownload = `https://github.com/acquia/cli/releases/download/${acliVersion}/acli.phar`;
      }
      // Download release
      if (acliDownload !== null) {
        options.services.appserver.build.push(...[
          'curl -OL https://github.com/acquia/cli/releases/latest/download/acli.phar',
          'chmod +x acli.phar',
          'mv acli.phar /usr/local/bin/acli',
        ]);
      } else {
        // Build from source
        options.services.appserver.build.push(...[
          'rm -rf /usr/local/cli',
          `cd /usr/local/ && git clone git@github.com:acquia/cli.git -b "${acliVersion}" && cd cli && composer install`,
          'ln -s /usr/local/cli/bin/acli /usr/local/bin/acli',
        ]);
      }

      // Set other relevant build steps after ACLI is installed
      options.services.appserver.build.push('/helpers/acquia-config-symlink.sh');
      options.services.appserver.build.push('cd /app && /usr/local/bin/acli pull:run-scripts -n');

      // Run acli login with credentials set in init; if applicable
      if (secret && key) {
        options.services.appserver.build.push(`/usr/local/bin/acli auth:login -k "${key}" -s "${sec}" -n`);
      }

      // Set our appserver env overrides
      options.services.appserver.overrides.environment = {
        AH_SITE_UUID: appUuid,
        AH_SITE_GROUP: group,
        AH_SITE_ENVIRONMENT: 'LANDO',
      };

      // Mount the acquia settings.php file for auto service "discovery"
      const settingsMount = `${options.confDest}/acquia-settings.inc:/var/www/site-php/${group}/${group}-settings.inc`;
      options.services.appserver.overrides.volumes.push(settingsMount);

      // Add acli tooling.
      options.tooling = {
        'acli': {
          service: 'appserver',
          description: 'Run the Acquia acli command',
          cmd: 'acli',
        },
        'pull': getAcquiaPull({key, secret, account, appUuid}, keys),
        // 'push': getAcquiaPush(options),
      };
      super(id, options);
    };
  },
};
