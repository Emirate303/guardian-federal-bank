<?php
/**
 * Guardian Federal Bank theme bootstrap.
 *
 * @package guardian-federal-bank
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'GUARDIAN_THEME_VERSION', '1.0.0' );

/**
 * Enqueue the compiled Vite app assets (CSS + JS) with hashed filenames.
 * Rebuilds of the app change the hash, so we resolve the filenames dynamically.
 */
function guardian_enqueue_app_assets() {
	$assets_dir = get_template_directory() . '/assets';

	$css = glob( $assets_dir . '/index-*.css' );
	$js  = glob( $assets_dir . '/index-*.js' );

	if ( ! empty( $css ) ) {
		wp_enqueue_style(
			'guardian-app',
			get_template_directory_uri() . '/assets/' . basename( $css[0] ),
			array(),
			GUARDIAN_THEME_VERSION
		);
	}

	if ( ! empty( $js ) ) {
		wp_enqueue_script(
			'guardian-app',
			get_template_directory_uri() . '/assets/' . basename( $js[0] ),
			array(),
			GUARDIAN_THEME_VERSION,
			true // In footer: #root is already rendered by index.php before wp_footer fires.
		);
	}
}
add_action( 'wp_enqueue_scripts', 'guardian_enqueue_app_assets' );

/**
 * Disable WordPress admin-bar front-end styles/scripts that can clash with the app's full-screen layout.
 */
add_theme_support( 'title-tag' );
add_theme_support( 'html5', array( 'search-form', 'gallery', 'caption', 'style', 'script' ) );

/**
 * Add PWA-related meta tags and icons to the document head.
 */
function guardian_head_meta() {
	?>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<meta name="theme-color" content="#0A192F" />
	<meta name="application-name" content="Guardian Federal Bank" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-title" content="Guardian Bank" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
	<meta name="mobile-web-app-capable" content="yes" />
	<link rel="icon" type="image/svg+xml" href="<?php echo esc_url( get_template_directory_uri() . '/guardian-bank-favicon.svg' ); ?>" />
	<link rel="apple-touch-icon" href="<?php echo esc_url( get_template_directory_uri() . '/guardian-bank-180.png' ); ?>" />
	<link rel="manifest" href="<?php echo esc_url( get_template_directory_uri() . '/manifest.webmanifest' ); ?>" />
	<?php
}
add_action( 'wp_head', 'guardian_head_meta', 1 );

/**
 * Remove default WP emoji scripts/styles for a cleaner head.
 */
add_action( 'init', function () {
	remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
	remove_action( 'wp_print_styles', 'print_emoji_styles' );
} );

/**
 * Optional: pass the WP home URL into the app via a global JS variable,
 * in case the React app needs it for API routing.
 */
function guardian_localize_app() {
	wp_localize_script( 'guardian-app', 'GUARDIAN_WP', array(
		'siteUrl'    => home_url( '/' ),
		'restUrl'    => esc_url_raw( rest_url() ),
		'themeUrl'   => get_template_directory_uri(),
		'loggedIn'   => is_user_logged_in(),
	) );
}
add_action( 'wp_enqueue_scripts', 'guardian_localize_app', 20 );
